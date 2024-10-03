import {
	RundownId,
	RundownPlaylistActivationId,
	RundownPlaylistId,
	ShowStyleBaseId,
	StudioId,
} from '@sofie-automation/corelib/dist/dataModel/Ids'
import { literal } from '@sofie-automation/corelib/dist/lib'
import { MongoFieldSpecifierOnesStrict } from '@sofie-automation/corelib/dist/mongo'
import EventEmitter from 'events'
import { Meteor } from 'meteor/meteor'
import _ from 'underscore'
import { MongoCursor } from '../../../lib/collections/lib'
import { DBRundownPlaylist } from '../../../lib/collections/RundownPlaylists'
import { DBRundown } from '../../../lib/collections/Rundowns'
import { DBShowStyleBase } from '@sofie-automation/corelib/dist/dataModel/ShowStyleBase'
import { logger } from '../../logging'
import { observerChain } from '../../publications/lib/observerChain'
import { ContentCache } from './reactiveContentCache'
import { ContentCache as PieceInstancesContentCache } from './reactiveContentCacheForPieceInstances'
import { RundownContentObserver } from './RundownContentObserver'
import { RundownsObserver } from './RundownsObserver'
import { RundownPlaylists, Rundowns, ShowStyleBases } from '../../collections'
import { PieceInstancesObserver } from './PieceInstancesObserver'

type RundownContentChangeHandler = (showStyleBaseId: ShowStyleBaseId, cache: ContentCache) => () => void
type PieceInstancesChangeHandler = (showStyleBaseId: ShowStyleBaseId, cache: PieceInstancesContentCache) => () => void

const REACTIVITY_DEBOUNCE = 20

type RundownPlaylistFields = '_id' | 'nextPartInfo' | 'currentPartInfo' | 'activationId'
const rundownPlaylistFieldSpecifier = literal<
	MongoFieldSpecifierOnesStrict<Pick<DBRundownPlaylist, RundownPlaylistFields>>
>({
	_id: 1,
	activationId: 1,
	currentPartInfo: 1,
	nextPartInfo: 1,
})

type RundownFields = '_id' | 'showStyleBaseId'
const rundownFieldSpecifier = literal<MongoFieldSpecifierOnesStrict<Pick<DBRundown, RundownFields>>>({
	_id: 1,
	showStyleBaseId: 1,
})

type ShowStyleBaseFields = '_id' | 'sourceLayersWithOverrides' | 'outputLayersWithOverrides' | 'hotkeyLegend'
const showStyleBaseFieldSpecifier = literal<MongoFieldSpecifierOnesStrict<Pick<DBShowStyleBase, ShowStyleBaseFields>>>({
	_id: 1,
	sourceLayersWithOverrides: 1,
	outputLayersWithOverrides: 1,
	hotkeyLegend: 1,
})

export class StudioObserver extends EventEmitter {
	#playlistInStudioLiveQuery: Meteor.LiveQueryHandle
	#showStyleOfRundownLiveQuery: Meteor.LiveQueryHandle | undefined
	#rundownsLiveQuery: Meteor.LiveQueryHandle | undefined
	#pieceInstancesLiveQuery: Meteor.LiveQueryHandle | undefined
	activePlaylistId: RundownPlaylistId | undefined
	activationId: RundownPlaylistActivationId | undefined
	currentRundownId: RundownId | undefined
	showStyleBaseId: ShowStyleBaseId | undefined

	#rundownContentChanged: RundownContentChangeHandler
	#pieceInstancesChanged: PieceInstancesChangeHandler

	constructor(
		studioId: StudioId,
		onRundownContentChanged: RundownContentChangeHandler,
		pieceInstancesChanged: PieceInstancesChangeHandler
	) {
		super()
		this.#rundownContentChanged = onRundownContentChanged
		this.#pieceInstancesChanged = pieceInstancesChanged
		this.#playlistInStudioLiveQuery = observerChain()
			.next(
				'activePlaylist',
				async () =>
					RundownPlaylists.findWithCursor(
						{
							studioId: studioId,
							activationId: { $exists: true },
						},
						{
							projection: rundownPlaylistFieldSpecifier,
						}
					) as Promise<MongoCursor<Pick<DBRundownPlaylist, RundownPlaylistFields>>>
			)
			.end(this.updatePlaylistInStudio)
	}

	private updatePlaylistInStudio = _.debounce(
		Meteor.bindEnvironment(
			(
				state: {
					activePlaylist: Pick<DBRundownPlaylist, RundownPlaylistFields>
				} | null
			): void => {
				const activePlaylistId = state?.activePlaylist?._id
				const activationId = state?.activePlaylist?.activationId
				const currentRundownId =
					state?.activePlaylist?.currentPartInfo?.rundownId ?? state?.activePlaylist?.nextPartInfo?.rundownId

				if (!activePlaylistId || !activationId || !currentRundownId) {
					this.#showStyleOfRundownLiveQuery?.stop()
					this.activePlaylistId = undefined
					this.activationId = undefined
					this.currentRundownId = undefined
					return
				}

				if (
					currentRundownId === this.currentRundownId &&
					activePlaylistId === this.activePlaylistId &&
					activationId === this.activationId
				)
					return

				this.#showStyleOfRundownLiveQuery?.stop()
				this.#showStyleOfRundownLiveQuery = undefined

				this.activePlaylistId = activePlaylistId
				this.activationId = activationId
				this.currentRundownId = currentRundownId

				this.#showStyleOfRundownLiveQuery = this.setupShowStyleOfRundownObserver(currentRundownId)
			}
		),
		REACTIVITY_DEBOUNCE
	)

	private setupShowStyleOfRundownObserver = (rundownId: RundownId): Meteor.LiveQueryHandle => {
		return observerChain()
			.next(
				'currentRundown',
				async () =>
					Rundowns.findWithCursor({ _id: rundownId }, { fields: rundownFieldSpecifier, limit: 1 }) as Promise<
						MongoCursor<Pick<DBRundown, RundownFields>>
					>
			)
			.next('showStyleBase', async (chain) =>
				chain.currentRundown
					? (ShowStyleBases.findWithCursor(
							{ _id: chain.currentRundown.showStyleBaseId },
							{
								fields: showStyleBaseFieldSpecifier,
								limit: 1,
							}
					  ) as Promise<MongoCursor<Pick<DBShowStyleBase, ShowStyleBaseFields>>>)
					: null
			)
			.end(this.updateShowStyle)
	}

	private updateShowStyle = _.debounce(
		Meteor.bindEnvironment(
			(
				state: {
					currentRundown: Pick<DBRundown, RundownFields>
					showStyleBase: Pick<DBShowStyleBase, ShowStyleBaseFields>
				} | null
			) => {
				const showStyleBaseId = state?.showStyleBase._id

				if (showStyleBaseId === undefined || !this.activePlaylistId || !this.activationId) {
					this.#rundownsLiveQuery?.stop()
					this.#rundownsLiveQuery = undefined
					this.showStyleBaseId = showStyleBaseId

					this.#pieceInstancesLiveQuery?.stop()
					this.#pieceInstancesLiveQuery = undefined
					return
				}

				if (showStyleBaseId === this.showStyleBaseId) return

				this.#rundownsLiveQuery?.stop()
				this.#rundownsLiveQuery = undefined

				this.#pieceInstancesLiveQuery?.stop()
				this.#pieceInstancesLiveQuery = undefined

				const activePlaylistId = this.activePlaylistId
				this.showStyleBaseId = showStyleBaseId

				let cleanupChanges: (() => void) | undefined = undefined

				this.#rundownsLiveQuery = new RundownsObserver(activePlaylistId, (rundownIds) => {
					logger.silly(`Creating new RundownContentObserver`)
					const obs1 = new RundownContentObserver(activePlaylistId, showStyleBaseId, rundownIds, (cache) => {
						cleanupChanges = this.#rundownContentChanged(showStyleBaseId, cache)

						return () => {
							void 0
						}
					})

					return () => {
						obs1.stop()
						cleanupChanges?.()
					}
				})

				this.#pieceInstancesLiveQuery = new PieceInstancesObserver(
					this.activationId,
					showStyleBaseId,
					(cache) => {
						const cleanupChanges = this.#pieceInstancesChanged(showStyleBaseId, cache)

						return () => {
							cleanupChanges?.()
						}
					}
				)
			}
		),
		REACTIVITY_DEBOUNCE
	)

	public stop = (): void => {
		this.#playlistInStudioLiveQuery.stop()
		this.updatePlaylistInStudio.cancel()
	}
}
