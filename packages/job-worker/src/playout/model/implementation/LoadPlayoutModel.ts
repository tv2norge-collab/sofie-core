import { DBRundown } from '@sofie-automation/corelib/dist/dataModel/Rundown'
import { DBRundownPlaylist } from '@sofie-automation/corelib/dist/dataModel/RundownPlaylist'
import { ReadOnlyCache } from '../../../cache/CacheBase'
import { DatabasePersistedModel } from '../../../modelBase'
import { CacheForIngest } from '../../../ingest/cache'
import { PlaylistLock } from '../../../jobs/lock'
import { ReadonlyDeep } from 'type-fest'
import { JobContext } from '../../../jobs'
import { PlayoutModelImpl } from './PlayoutModelImpl'
import { PlayoutRundownModelImpl } from './PlayoutRundownModelImpl'
import { RundownId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import { DBPartInstance } from '@sofie-automation/corelib/dist/dataModel/PartInstance'
import { PieceInstance } from '@sofie-automation/corelib/dist/dataModel/PieceInstance'
import { SegmentOrphanedReason } from '@sofie-automation/corelib/dist/dataModel/Segment'
import { TimelineComplete } from '@sofie-automation/corelib/dist/dataModel/Timeline'
import { MongoQuery } from '@sofie-automation/corelib/dist/mongo'
import _ = require('underscore')
import { clone, groupByToMap, groupByToMapFunc } from '@sofie-automation/corelib/dist/lib'
import { PlayoutSegmentModelImpl } from './PlayoutSegmentModelImpl'
import { unprotectString } from '@sofie-automation/corelib/dist/protectedString'
import { PlayoutPartInstanceModelImpl } from './PlayoutPartInstanceModelImpl'
import { PeripheralDevice } from '@sofie-automation/corelib/dist/dataModel/PeripheralDevice'
import { PlayoutModel, PlayoutModelPreInit } from '../PlayoutModel'

/**
 * Load a PlayoutModelPreInit for the given RundownPlaylist
 * @param context Context from the job queue
 * @param playlistLock Lock for the RundownPlaylist to load
 * @param tmpPlaylist Temporary copy of the RundownPlaylist to load
 * @param reloadPlaylist Whether to reload the RundownPlaylist, or use the temporary copy
 * @returns Loaded PlayoutModelPreInit
 */
export async function loadPlayoutModelPreInit(
	context: JobContext,
	playlistLock: PlaylistLock,
	tmpPlaylist: ReadonlyDeep<DBRundownPlaylist>,
	reloadPlaylist = true
): Promise<PlayoutModelPreInit> {
	const span = context.startSpan('CacheForPlayoutPreInit.createPreInit')
	if (span) span.setLabel('playlistId', unprotectString(tmpPlaylist._id))

	if (!playlistLock.isLocked) {
		throw new Error('Cannot create cache with released playlist lock')
	}

	const [PeripheralDevices, Playlist, Rundowns] = await Promise.all([
		context.directCollections.PeripheralDevices.findFetch({ studioId: tmpPlaylist.studioId }),
		reloadPlaylist ? context.directCollections.RundownPlaylists.findOne(tmpPlaylist._id) : clone(tmpPlaylist),
		context.directCollections.Rundowns.findFetch({ playlistId: tmpPlaylist._id }),
	])

	if (!Playlist) throw new Error(`Playlist "${tmpPlaylist._id}" not found!`)

	const res: PlayoutModelPreInit = {
		playlistId: playlistLock.playlistId,
		playlistLock: playlistLock,

		peripheralDevices: PeripheralDevices,

		playlist: Playlist,
		rundowns: Rundowns,

		getRundown: (id: RundownId) => Rundowns.find((rd) => rd._id === id),
	}
	if (span) span.end()
	return res
}

/**
 * Load a PlayoutModel partially from the database, partially from an IngestModel.
 * Anything belonging to the Rundown of the IngestModel will be taken from there, as it is assumed to be the most up to date copy of the data
 * @param context Context from the job queue
 * @param playlistLock Lock for the RundownPlaylist to load
 * @param loadedPlaylist Preloaded copy of the RundownPlaylist
 * @param newRundowns Preloaded copy of the Rundowns belonging to the RundownPlaylist
 * @param ingestCache IngestModel to take data from
 * @returns Loaded PlayoutModel
 */
export async function createPlayoutCachefromIngestCache(
	context: JobContext,
	playlistLock: PlaylistLock,
	loadedPlaylist: ReadonlyDeep<DBRundownPlaylist>,
	newRundowns: ReadonlyDeep<Array<DBRundown>>,
	ingestCache: ReadOnlyCache<CacheForIngest>
): Promise<PlayoutModel & DatabasePersistedModel> {
	const [peripheralDevices, playlist, rundowns] = await loadInitData(context, loadedPlaylist, false, newRundowns)
	const rundownIds = rundowns.map((r) => r._id)

	const [partInstances, rundownsWithContent, timeline] = await Promise.all([
		loadPartInstances(context, loadedPlaylist, rundownIds),
		loadRundowns(context, ingestCache, rundowns),
		loadTimeline(context),
	])

	const res = new PlayoutModelImpl(
		context,
		playlistLock,
		loadedPlaylist._id,
		peripheralDevices,
		playlist,
		partInstances,
		rundownsWithContent,
		timeline
	)

	return res
}

async function loadTimeline(context: JobContext): Promise<TimelineComplete | undefined> {
	// Future: This could be defered until we get to updateTimeline. It could be a small performance boost
	return context.directCollections.Timelines.findOne(context.studioId)
}

async function loadInitData(
	context: JobContext,
	tmpPlaylist: ReadonlyDeep<DBRundownPlaylist>,
	reloadPlaylist: boolean,
	existingRundowns: ReadonlyDeep<DBRundown[]> | undefined
): Promise<[ReadonlyDeep<PeripheralDevice[]>, DBRundownPlaylist, ReadonlyDeep<DBRundown[]>]> {
	const [peripheralDevices, reloadedPlaylist, rundowns] = await Promise.all([
		context.directCollections.PeripheralDevices.findFetch({ studioId: tmpPlaylist.studioId }),
		reloadPlaylist
			? await context.directCollections.RundownPlaylists.findOne(tmpPlaylist._id)
			: clone<DBRundownPlaylist>(tmpPlaylist),
		existingRundowns ?? context.directCollections.Rundowns.findFetch({ playlistId: tmpPlaylist._id }),
	])

	if (!reloadedPlaylist) throw new Error(`RundownPlaylist went missing!`)

	return [peripheralDevices, reloadedPlaylist, rundowns]
}

/**
 * Load a PlayoutModel from a PlayoutModelPreInit
 * @param context Context from the job queue
 * @param initModel Preloaded PlayoutModelPreInit describing the RundownPlaylist to load
 * @returns Loaded PlayoutModel
 */
export async function createPlayoutModelfromInitModel(
	context: JobContext,
	initModel: PlayoutModelPreInit
): Promise<PlayoutModel & DatabasePersistedModel> {
	const span = context.startSpan('CacheForPlayout.fromInit')
	if (span) span.setLabel('playlistId', unprotectString(initModel.playlistId))

	if (!initModel.playlistLock.isLocked) {
		throw new Error('Cannot create cache with released playlist lock')
	}

	const rundownIds = initModel.rundowns.map((r) => r._id)

	const [partInstances, rundownsWithContent, timeline] = await Promise.all([
		loadPartInstances(context, initModel.playlist, rundownIds),
		loadRundowns(context, null, initModel.rundowns),
		loadTimeline(context),
	])

	const res = new PlayoutModelImpl(
		context,
		initModel.playlistLock,
		initModel.playlistId,
		initModel.peripheralDevices,
		clone<DBRundownPlaylist>(initModel.playlist),
		partInstances,
		rundownsWithContent,
		timeline
	)

	if (span) span.end()
	return res
}

async function loadRundowns(
	context: JobContext,
	ingestCache: ReadOnlyCache<CacheForIngest> | null,
	rundowns: ReadonlyDeep<DBRundown[]>
): Promise<PlayoutRundownModelImpl[]> {
	const rundownIds = rundowns.map((rd) => rd._id)

	// If there is an ingestCache, then avoid loading some bits from the db for that rundown
	const loadRundownIds = ingestCache ? rundownIds.filter((id) => id !== ingestCache.RundownId) : rundownIds
	const baselineFromIngest = ingestCache?.RundownBaselineObjs.getIfLoaded()
	const loadBaselineIds = baselineFromIngest ? loadRundownIds : rundownIds

	const [segments, parts, baselineObjects] = await Promise.all([
		context.directCollections.Segments.findFetch({
			$or: [
				{
					// In a different rundown
					rundownId: { $in: loadRundownIds },
				},
				{
					// Is the scratchpad
					rundownId: { $in: rundownIds },
					orphaned: SegmentOrphanedReason.SCRATCHPAD,
				},
			],
		}),
		context.directCollections.Parts.findFetch({ rundownId: { $in: loadRundownIds } }),
		context.directCollections.RundownBaselineObjects.findFetch({ rundownId: { $in: loadBaselineIds } }),
	])

	if (ingestCache) {
		// Populate the collections with the cached data instead
		segments.push(...ingestCache.Segments.findAll(null))
		parts.push(...ingestCache.Parts.findAll(null))
		if (baselineFromIngest) {
			baselineObjects.push(...baselineFromIngest.findAll(null))
		}
	}

	const groupedParts = groupByToMap(parts, 'segmentId')
	const segmentsWithParts = segments.map(
		(segment) => new PlayoutSegmentModelImpl(segment, groupedParts.get(segment._id) ?? [])
	)
	const groupedSegmentsWithParts = groupByToMapFunc(segmentsWithParts, (s) => s.segment.rundownId)

	const groupedBaselineObjects = groupByToMap(baselineObjects, 'rundownId')

	return rundowns.map(
		(rundown) =>
			new PlayoutRundownModelImpl(
				rundown,
				groupedSegmentsWithParts.get(rundown._id) ?? [],
				groupedBaselineObjects.get(rundown._id) ?? []
			)
	)
}

/**
 * Intitialise the full content of the cache
 * @param ingestCache A CacheForIngest that is pending saving, if this is following an ingest operation
 */
async function loadPartInstances(
	context: JobContext,
	playlist: ReadonlyDeep<DBRundownPlaylist>,
	rundownIds: RundownId[]
): Promise<PlayoutPartInstanceModelImpl[]> {
	const selectedPartInstanceIds = _.compact([
		playlist.currentPartInfo?.partInstanceId,
		playlist.nextPartInfo?.partInstanceId,
		playlist.previousPartInfo?.partInstanceId,
	])

	const partInstancesCollection = Promise.resolve().then(async () => {
		// Future: We could optimise away this query if we tracked the segmentIds of these PartInstances on the playlist
		const segmentIds = _.uniq(
			(
				await context.directCollections.PartInstances.findFetch(
					{
						_id: { $in: selectedPartInstanceIds },
					},
					{
						projection: {
							segmentId: 1,
						},
					}
				)
			).map((p) => p.segmentId)
		)

		const partInstancesSelector: MongoQuery<DBPartInstance> = {
			rundownId: { $in: rundownIds },
			$or: [
				{
					segmentId: { $in: segmentIds },
					reset: { $ne: true },
				},
				{
					_id: { $in: selectedPartInstanceIds },
				},
			],
		}
		// Filter the PieceInstances to the activationId, if possible
		pieceInstancesSelector.playlistActivationId = playlist.activationId || { $exists: false }

		return context.directCollections.PartInstances.findFetch(partInstancesSelector)
	})

	const pieceInstancesSelector: MongoQuery<PieceInstance> = {
		rundownId: { $in: rundownIds },
		partInstanceId: { $in: selectedPartInstanceIds },
	}
	// Filter the PieceInstances to the activationId, if possible
	pieceInstancesSelector.playlistActivationId = playlist.activationId || { $exists: false }

	const [partInstances, pieceInstances] = await Promise.all([
		partInstancesCollection,
		context.directCollections.PieceInstances.findFetch(pieceInstancesSelector),
	])

	const groupedPieceInstances = groupByToMap(pieceInstances, 'partInstanceId')

	const allPartInstances: PlayoutPartInstanceModelImpl[] = []
	for (const partInstance of partInstances) {
		const wrappedPartInstance = new PlayoutPartInstanceModelImpl(
			partInstance,
			groupedPieceInstances.get(partInstance._id) ?? [],
			false
		)
		allPartInstances.push(wrappedPartInstance)
	}

	return allPartInstances
}