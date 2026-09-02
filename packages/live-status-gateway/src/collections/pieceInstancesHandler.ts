import { Logger } from 'winston'
import { CoreHandler } from '../coreHandler.js'
import { PublicationCollection } from '../publicationCollection.js'
import { DBRundownPlaylist } from '@sofie-automation/corelib/dist/dataModel/RundownPlaylist'
import { PieceInstance } from '@sofie-automation/corelib/dist/dataModel/PieceInstance'
import { CollectionName } from '@sofie-automation/corelib/dist/dataModel/Collections'
import areElementsShallowEqual from '@sofie-automation/shared-lib/dist/lib/isShallowEqual'
import _ from 'underscore'
import { CorelibPubSub } from '@sofie-automation/corelib/dist/pubsub'
import { PartInstanceId, PieceInstanceInfiniteId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import {
	createPartCurrentTimes,
	PieceInstanceWithTimings,
	processAndPrunePieceInstanceTimings,
	resolvePrunedPieceInstance,
} from '@sofie-automation/corelib/dist/playout/processAndPrune'
import { ShowStyleBaseExt } from './showStyleBaseHandler.js'
import { SourceLayers } from '@sofie-automation/corelib/dist/dataModel/ShowStyleBase'
import { SelectedPartInstances } from './partInstancesHandler.js'
import { DBPartInstance } from '@sofie-automation/corelib/dist/dataModel/PartInstance'
import { arePropertiesDeepEqual } from '../helpers/equality.js'
import { CollectionHandlers } from '../liveStatusServer.js'
import { ReadonlyDeep } from 'type-fest'
import { PickKeys } from '@sofie-automation/shared-lib/dist/lib/types'

const PLAYLIST_KEYS = [
	'_id',
	'activationId',
	'currentPartInfo',
	'nextPartInfo',
	'previousPartsInfo',
	'rundownIdsInOrder',
] as const
type Playlist = PickKeys<DBRundownPlaylist, typeof PLAYLIST_KEYS>

const PART_INSTANCES_KEYS = ['previous', 'current'] as const
type PartInstances = PickKeys<SelectedPartInstances, typeof PART_INSTANCES_KEYS>

const SHOW_STYLE_BASE_KEYS = ['sourceLayers'] as const
type ShowStyle = PickKeys<ShowStyleBaseExt, typeof SHOW_STYLE_BASE_KEYS>

export type PieceInstanceMin = Omit<ReadonlyDeep<PieceInstance>, 'reportedStartedPlayback' | 'reportedStoppedPlayback'>

export interface SelectedPieceInstances {
	// Pieces reported by the Playout Gateway as active
	active: PieceInstanceMin[]

	// Pieces present in the current part instance
	currentPartInstance: PieceInstanceMin[]

	// Pieces present in the next part instance
	nextPartInstance: PieceInstanceMin[]
}

export class PieceInstancesHandler extends PublicationCollection<
	SelectedPieceInstances,
	CorelibPubSub.pieceInstances,
	CollectionName.PieceInstances
> {
	private _currentPlaylist: Playlist | undefined
	private _partInstanceIds: PartInstanceId[] = []
	private _sourceLayers: SourceLayers = {}
	private _partInstances: PartInstances | undefined

	constructor(logger: Logger, coreHandler: CoreHandler) {
		super(CollectionName.PieceInstances, CorelibPubSub.pieceInstances, logger, coreHandler)
		this._collectionData = {
			active: [],
			currentPartInstance: [],
			nextPartInstance: [],
		}
	}

	init(handlers: CollectionHandlers): void {
		super.init(handlers)

		handlers.playlistHandler.subscribe(this.onPlaylistUpdate, PLAYLIST_KEYS)
		handlers.partInstancesHandler.subscribe(this.onPartInstancesUpdate, PART_INSTANCES_KEYS)
		handlers.showStyleBaseHandler.subscribe(this.onShowStyleBaseUpdate, SHOW_STYLE_BASE_KEYS)
	}

	protected changed(): void {
		this.updateAndNotify()
	}

	private processAndPrunePieceInstanceTimings(
		partInstance: DBPartInstance | undefined,
		pieceInstances: PieceInstance[],
		filterActive: boolean
	): PieceInstanceWithTimings[] {
		// Approximate when 'now' is in the PartInstance, so that any adlibbed Pieces will be timed roughly correctly
		const partTimes = createPartCurrentTimes(Date.now(), partInstance?.timings?.plannedStartedPlayback)

		const prunedPieceInstances = processAndPrunePieceInstanceTimings(
			this._sourceLayers,
			pieceInstances,
			partTimes,
			false
		)
		if (!filterActive) return prunedPieceInstances

		return prunedPieceInstances.filter((pieceInstance) => {
			// a reported stop always describes something that has already happened on the playout device
			if (pieceInstance.reportedStoppedPlayback != null) return false

			const resolvedPieceInstance = resolvePrunedPieceInstance(partTimes, pieceInstance)

			return (
				resolvedPieceInstance.resolvedStart <= partTimes.nowInPart &&
				(resolvedPieceInstance.resolvedDuration == null ||
					resolvedPieceInstance.resolvedStart + resolvedPieceInstance.resolvedDuration >
						partTimes.nowInPart) &&
				pieceInstance.piece.virtual !== true &&
				pieceInstance.disabled !== true
			)
		})
	}

	private updateCollectionData(): boolean {
		if (!this._collectionData) return false
		const collection = this.getCollectionOrFail()

		const pieceInstancesInCurrentPartInstance = this._currentPlaylist?.currentPartInfo?.partInstanceId
			? collection.find({ partInstanceId: this._currentPlaylist.currentPartInfo.partInstanceId })
			: []
		const inCurrentPartInstance = this.processAndPrunePieceInstanceTimings(
			this._partInstances?.current,
			pieceInstancesInCurrentPartInstance,
			true
		)

		// An infinite Piece spanning a take exists as a separate PieceInstance in every PartInstance it plays in.
		// The copy in the most recent PartInstance is the authoritative one, as it is the only one a stop is applied
		// to (as a userDuration, or as a virtual Piece inserted into that PartInstance), so the older copies have to
		// be ignored, or a stopped Piece would keep being reported as active.
		// This is the equivalent of `mergeInfinitesIntoCurrentPart` in core.
		const seenInfiniteInstanceIds = new Set<PieceInstanceInfiniteId>()
		const collectInfiniteInstanceIds = (pieceInstances: PieceInstance[]) => {
			for (const pieceInstance of pieceInstances) {
				if (pieceInstance.infinite) seenInfiniteInstanceIds.add(pieceInstance.infinite.infiniteInstanceId)
			}
		}
		collectInfiniteInstanceIds(pieceInstancesInCurrentPartInstance)

		// Compute active pieces for each previous part. A previous part is kept in previousPartsInfo after it has
		// stopped contributing to playout (core always keeps at least one entry), but its Pieces have a definite end
		// on the timeline, so they report a stop when they stop, which is what removes them from here
		const previousPartInstancesById = new Map(
			(this._partInstances?.previous ?? []).map((partInstance) => [partInstance._id, partInstance])
		)
		const inPreviousPartInstances: PieceInstanceWithTimings[] = []
		for (const info of this._currentPlaylist?.previousPartsInfo ?? []) {
			if (!info.partInstanceId) continue

			const pieceInstancesInPartInstance = collection.find({ partInstanceId: info.partInstanceId })
			inPreviousPartInstances.push(
				...this.processAndPrunePieceInstanceTimings(
					previousPartInstancesById.get(info.partInstanceId),
					pieceInstancesInPartInstance,
					true
				).filter(
					(pieceInstance) =>
						!pieceInstance.infinite ||
						!seenInfiniteInstanceIds.has(pieceInstance.infinite.infiniteInstanceId)
				)
			)
			collectInfiniteInstanceIds(pieceInstancesInPartInstance)
		}

		const inNextPartInstance = this._currentPlaylist?.nextPartInfo?.partInstanceId
			? this.processAndPrunePieceInstanceTimings(
					undefined,
					collection.find({ partInstanceId: this._currentPlaylist.nextPartInfo.partInstanceId }),
					false
				)
			: []

		const active = [...inCurrentPartInstance, ...inPreviousPartInstances]

		let hasAnythingChanged = false
		if (!_.isEqual(this._collectionData.active, active)) {
			this._collectionData.active = active
			hasAnythingChanged = true
		}
		if (
			this._collectionData.currentPartInstance.length !== inCurrentPartInstance.length ||
			this._collectionData.currentPartInstance.some((pieceInstance, index) => {
				return !arePropertiesDeepEqual<PieceInstanceWithTimings>(inCurrentPartInstance[index], pieceInstance, [
					'plannedStartedPlayback',
					'plannedStoppedPlayback',
					'reportedStartedPlayback',
					'reportedStoppedPlayback',
					'resolvedEndCap',
					'priority',
				])
			})
		) {
			this._logger.debug('xcur', { prev: this._collectionData.currentPartInstance, cur: inCurrentPartInstance })
			this._collectionData.currentPartInstance = inCurrentPartInstance
			hasAnythingChanged = true
		}
		if (
			this._collectionData.nextPartInstance.length !== inNextPartInstance.length ||
			this._collectionData.nextPartInstance.some((pieceInstance, index) => {
				return !arePropertiesDeepEqual<PieceInstanceWithTimings>(inNextPartInstance[index], pieceInstance, [
					'plannedStartedPlayback',
					'plannedStoppedPlayback',
					'reportedStartedPlayback',
					'reportedStoppedPlayback',
					'resolvedEndCap',
					'priority',
				])
			})
		) {
			this._collectionData.nextPartInstance = inNextPartInstance
			hasAnythingChanged = true
		}
		return hasAnythingChanged
	}

	private clearCollectionData() {
		if (!this._collectionData) return
		this._collectionData.active = []
		this._collectionData.currentPartInstance = []
		this._collectionData.nextPartInstance = []
	}

	private onShowStyleBaseUpdate = (showStyleBase: ShowStyle | undefined): void => {
		this.logUpdateReceived('showStyleBase')
		this._sourceLayers = showStyleBase?.sourceLayers ?? {}
		this.updateAndNotify()
	}

	private onPartInstancesUpdate = (partInstances: PartInstances | undefined): void => {
		this.logUpdateReceived('partInstances')
		this._partInstances = partInstances
		this.updateAndNotify()
	}

	private onPlaylistUpdate = (playlist: Playlist | undefined): void => {
		this.logUpdateReceived('playlist', `rundownPlaylistId ${playlist?._id}, active ${!!playlist?.activationId}`)

		const prevPartInstanceIds = this._partInstanceIds
		const prevPlaylist = this._currentPlaylist

		this._currentPlaylist = playlist

		this._partInstanceIds = this._currentPlaylist
			? _.compact(
					[
						...(this._currentPlaylist.previousPartsInfo ?? []).map((info) => info.partInstanceId),
						this._currentPlaylist.nextPartInfo?.partInstanceId,
						this._currentPlaylist.currentPartInfo?.partInstanceId,
					].sort()
				)
			: []
		if (this._currentPlaylist && this._partInstanceIds.length && this._currentPlaylist?.activationId) {
			const sameSubscription =
				areElementsShallowEqual(this._partInstanceIds, prevPartInstanceIds) &&
				areElementsShallowEqual(
					prevPlaylist?.rundownIdsInOrder ?? [],
					this._currentPlaylist.rundownIdsInOrder
				) &&
				prevPlaylist?.activationId === this._currentPlaylist?.activationId
			if (!sameSubscription) {
				this.setupSubscription(this._currentPlaylist.rundownIdsInOrder, this._partInstanceIds, {})
			} else if (this._subscriptionId) {
				this.updateAndNotify()
			} else {
				this.clearAndNotify()
			}
		} else {
			this.clearAndNotify()
		}
	}

	private clearAndNotify() {
		this.clearCollectionData()
		this.notify(this._collectionData)
	}

	private updateAndNotify() {
		const hasAnythingChanged = this.updateCollectionData()
		if (hasAnythingChanged) {
			this.notify(this._collectionData)
		}
	}
}
