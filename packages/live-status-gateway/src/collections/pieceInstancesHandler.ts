import { Logger } from 'winston'
import { CoreHandler } from '../coreHandler.js'
import { PublicationCollection } from '../publicationCollection.js'
import { DBRundownPlaylist } from '@sofie-automation/corelib/dist/dataModel/RundownPlaylist'
import { PieceInstance } from '@sofie-automation/corelib/dist/dataModel/PieceInstance'
import { CollectionName } from '@sofie-automation/corelib/dist/dataModel/Collections'
import areElementsShallowEqual from '@sofie-automation/shared-lib/dist/lib/isShallowEqual'
import _ from 'underscore'
import { CorelibPubSub } from '@sofie-automation/corelib/dist/pubsub'
import { PartInstanceId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import {
	createPartCurrentTimes,
	PartCurrentTimes,
	PieceInstanceWithTimings,
	processAndPrunePieceInstanceTimings,
	resolvePrunedPieceInstance,
} from '@sofie-automation/corelib/dist/playout/processAndPrune'
import { ShowStyleBaseExt } from './showStyleBaseHandler.js'
import { SourceLayers } from '@sofie-automation/corelib/dist/dataModel/ShowStyleBase'
import { SelectedPartInstances } from './partInstancesHandler.js'
import { DBPartInstance } from '@sofie-automation/corelib/dist/dataModel/PartInstance'
import { arePropertiesDeepEqual } from '../helpers/equality.js'
import { CoalescedDeadlineScheduler } from '../helpers/coalescedDeadlineScheduler.js'
import { CollectionHandlers } from '../liveStatusServer.js'
import { ReadonlyDeep } from 'type-fest'
import { PickKeys } from '@sofie-automation/shared-lib/dist/lib/types'
import { normalizeArrayToMap } from '@sofie-automation/corelib/dist/lib'
import { PieceLifespan } from '@sofie-automation/blueprints-integration'

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

const RECOMPUTE_COALESCE_WINDOW_MS = 100

export type PieceInstanceMin = Omit<ReadonlyDeep<PieceInstance>, 'reportedStartedPlayback' | 'reportedStoppedPlayback'>

function omitReportedPlaybackTimings(pieceInstance: PieceInstanceWithTimings): PieceInstanceWithTimings {
	return _.omit(pieceInstance, 'reportedStartedPlayback', 'reportedStoppedPlayback') as PieceInstanceWithTimings
}

/**
 * The time until which a previous PartInstance's Pieces can still be on air: its timeline group is kept alive until
 * the group following it has been playing for `fromPartRemaining` (keepalive + postroll), mirroring what
 * `PlayoutModel.prunePreviousPartInstances` uses to decide when a previous PartInstance is done.
 * `referencePartInstance` is the current PartInstance for `previous[0]`, and `previous[i - 1]` for the older ones.
 * Returns `undefined` when the boundary is unknown, in which case the part is to be treated as still lingering.
 */
function getPartLingersUntil(referencePartInstance: DBPartInstance | undefined): number | undefined {
	const referenceStarted = referencePartInstance?.timings?.plannedStartedPlayback
	const fromPartRemaining = referencePartInstance?.partPlayoutTimings?.fromPartRemaining
	if (referenceStarted == null || fromPartRemaining == null) return undefined
	return referenceStarted + fromPartRemaining
}

/** The PieceInstances of a single Part, with the timings needed to reason about when each of them is on air */
interface PrunedPartPieceInstances {
	partTimes: PartCurrentTimes
	prunedPieceInstances: PieceInstanceWithTimings[]
}

export interface SelectedPieceInstances {
	// Pieces computed as currently active from the planned timings
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
	/** Fires a recompute when a piece is due to start or stop being active, based on planned timings */
	private readonly _recomputeScheduler = new CoalescedDeadlineScheduler(RECOMPUTE_COALESCE_WINDOW_MS, () =>
		this.updateAndNotify()
	)

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
		now: number
	): PrunedPartPieceInstances {
		// Approximate when 'now' is in the PartInstance, so that any adlibbed Pieces will be timed roughly correctly
		const partTimes = createPartCurrentTimes(now, partInstance?.timings?.plannedStartedPlayback)

		const prunedPieceInstances = processAndPrunePieceInstanceTimings(
			this._sourceLayers,
			pieceInstances,
			partTimes,
			false
		).map(omitReportedPlaybackTimings)

		return { partTimes, prunedPieceInstances }
	}

	/** Narrow the Pieces of a Part down to the ones that are on air, scheduling a recompute at every upcoming boundary */
	private filterActivePieceInstances({
		partTimes,
		prunedPieceInstances,
	}: PrunedPartPieceInstances): PieceInstanceWithTimings[] {
		return prunedPieceInstances.filter((pieceInstance) => {
			if (pieceInstance.piece.virtual === true || pieceInstance.disabled === true) return false

			const resolvedPieceInstance = resolvePrunedPieceInstance(partTimes, pieceInstance)

			if (resolvedPieceInstance.resolvedStart > partTimes.nowInPart) {
				this.scheduleRecomputeAt(partTimes, resolvedPieceInstance.resolvedStart)
				return false
			}
			if (resolvedPieceInstance.resolvedDuration != null) {
				const resolvedEnd = resolvedPieceInstance.resolvedStart + resolvedPieceInstance.resolvedDuration
				if (resolvedEnd <= partTimes.nowInPart) return false
				this.scheduleRecomputeAt(partTimes, resolvedEnd)
			}
			return true
		})
	}

	/** Schedule a recompute for when the playhead will reach a point within the part */
	private scheduleRecomputeAt(partTimes: PartCurrentTimes, timeInPart: number): void {
		// if the part hasn't started playing, the boundary can't be anchored to a wall-clock time,
		// but the playhead change that starts it will trigger a recompute anyway
		if (partTimes.partStartTime == null) return
		this._recomputeScheduler.scheduleAt(partTimes.partStartTime + timeInPart)
	}

	private updateCollectionData(): boolean {
		if (!this._collectionData) return false
		const collection = this.getCollectionOrFail()

		const now = Date.now()
		// all still-relevant future boundaries will be re-scheduled while filtering below
		this._recomputeScheduler.cancel()

		const currentPartInstancePieces = this.processAndPrunePieceInstanceTimings(
			this._partInstances?.current,
			this._currentPlaylist?.currentPartInfo?.partInstanceId
				? collection.find({ partInstanceId: this._currentPlaylist.currentPartInfo.partInstanceId })
				: [],
			now
		)
		const inCurrentPartInstance = this.filterActivePieceInstances(currentPartInstancePieces)

		// Infinites continued into the current part are played back from their copy there, whether or not that copy
		// is on air right now, so this is deliberately derived from all of its Pieces rather than the active ones
		const currentInfiniteInstanceIds = new Set(
			_.compact(
				currentPartInstancePieces.prunedPieceInstances.map((pieceInstance) =>
					pieceInstance.infinite &&
					(pieceInstance.piece.lifespan !== PieceLifespan.WithinPart || pieceInstance.infinite.fromHold)
						? pieceInstance.infinite.infiniteInstanceId
						: undefined
				)
			)
		)

		// Compute active pieces for each previous part, up until the part stops lingering
		// (mirroring the timeline's part-group nesting); per-piece timing is handled by filterActivePieceInstances
		const previousPartsInfo = this._currentPlaylist?.previousPartsInfo ?? []
		const previousPartInstances = normalizeArrayToMap(this._partInstances?.previous ?? [], '_id')

		const inPreviousPartInstances: PieceInstanceWithTimings[] = previousPartsInfo.flatMap((info, index) => {
			if (!info.partInstanceId) return []
			const partInstance = previousPartInstances.get(info.partInstanceId)
			// previous[0]'s group is kept alive relative to the current part, older ones relative to the next-newer previous part
			const referencePartInstance =
				index === 0
					? this._partInstances?.current
					: previousPartInstances.get(previousPartsInfo[index - 1].partInstanceId)
			const lingersUntil = getPartLingersUntil(referencePartInstance)
			if (lingersUntil != null) {
				if (lingersUntil < now) return []
				this._recomputeScheduler.scheduleAt(lingersUntil)
			}
			return this.filterActivePieceInstances(
				this.processAndPrunePieceInstanceTimings(
					partInstance,
					collection.find({ partInstanceId: info.partInstanceId }),
					now
				)
			).filter(
				// infinites continuing in the current part have handed playback over to their copy there
				(pieceInstance) =>
					pieceInstance.infinite == null ||
					!currentInfiniteInstanceIds.has(pieceInstance.infinite.infiniteInstanceId)
			)
		})
		const inNextPartInstance = this._currentPlaylist?.nextPartInfo?.partInstanceId
			? this.processAndPrunePieceInstanceTimings(
					undefined,
					collection.find({ partInstanceId: this._currentPlaylist.nextPartInfo.partInstanceId }),
					now
				).prunedPieceInstances
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

	close(): void {
		super.close()
		this._recomputeScheduler.cancel()
	}

	protected stopSubscription(): void {
		// the scheduled recompute reads from the collection, which is unavailable while there is no connection to Core.
		// Any boundary that is still relevant gets re-scheduled by `updateCollectionData` once data flows again
		this._recomputeScheduler.cancel()
		super.stopSubscription()
	}

	private clearCollectionData() {
		this._recomputeScheduler.cancel()
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
