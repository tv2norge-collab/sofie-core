import { protectString } from '@sofie-automation/server-core-integration/dist'
import { PieceLifespan } from '@sofie-automation/blueprints-integration'
import { PieceInstance } from '@sofie-automation/corelib/dist/dataModel/PieceInstance'
import { DBPartInstance } from '@sofie-automation/corelib/dist/dataModel/PartInstance'
import { PartInstanceId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import { PartialDeep } from 'type-fest'
import { CoreHandler } from '../../coreHandler.js'
import { PieceInstancesHandler, SelectedPieceInstances } from '../pieceInstancesHandler.js'
import { SelectedPartInstances } from '../partInstancesHandler.js'
import { makeMockHandlers, makeMockLogger, makeTestPlaylist } from '../../topics/__tests__/utils.js'
import { ShowStyleBaseExt } from '../showStyleBaseHandler.js'

const CURRENT_PART_INSTANCE_ID = 'CURRENT_PART_INSTANCE_ID'
const PREVIOUS_PART_INSTANCE_ID = 'PREVIOUS_PART_INSTANCE_ID'
const OLDER_PART_INSTANCE_ID = 'OLDER_PART_INSTANCE_ID'
const INFINITE_INSTANCE_ID = 'INFINITE_INSTANCE_ID'

const NOW = 1700000000000
const CURRENT_PART_STARTED = NOW - 1000
const PREVIOUS_PART_STARTED = NOW - 3000
const OLDER_PART_STARTED = NOW - 8000

function makeMockCoreHandler(pieceInstances: PieceInstance[]): CoreHandler {
	const collection = {
		find: (selector: { partInstanceId: PartInstanceId }) =>
			pieceInstances.filter((pieceInstance) => pieceInstance.partInstanceId === selector.partInstanceId),
	}

	return {
		studioId: protectString('STUDIO_1'),
		core: {
			getCollection: () => collection,
		},
		setupSubscription: async () => protectString('SUBSCRIPTION_1'),
		unsubscribe: () => undefined,
		setupObserver: () => ({ stop: () => undefined }),
	} as unknown as CoreHandler
}

function makeTestPieceInstance(
	id: string,
	partInstanceId: string,
	props: PartialDeep<PieceInstance> = {}
): PieceInstance {
	const { piece, ...pieceInstanceProps } = props

	return {
		_id: protectString(id),
		rundownId: protectString('RUNDOWN_1'),
		playlistActivationId: protectString('ACTIVATION_1'),
		partInstanceId: protectString(partInstanceId),
		piece: {
			_id: protectString(`${id}_PIECE`),
			startPartId: protectString('PART_1'),
			externalId: `NCS_${id}`,
			name: id,
			enable: { start: 0 },
			lifespan: PieceLifespan.WithinPart,
			sourceLayerId: 'layer0',
			outputLayerId: 'pgm',
			invalid: false,
			content: {},
			timelineObjectsString: protectString(''),
			...piece,
		},
		...pieceInstanceProps,
	} as PieceInstance
}

/**
 * An unrelated piece of the current part, on a source layer of its own, that is always active.
 * Asserting that it survives proves that the collection data was actually recomputed
 */
function makeSentinelPieceInstance(): PieceInstance {
	return makeTestPieceInstance('SENTINEL', CURRENT_PART_INSTANCE_ID, { piece: { sourceLayerId: 'sentinel_layer' } })
}

function makeTestPartInstance(id: string, plannedStartedPlayback: number): DBPartInstance {
	return {
		_id: protectString(id),
		timings: { plannedStartedPlayback },
	} as DBPartInstance
}

function makeTestPartInstances(
	previous: DBPartInstance[] = [makeTestPartInstance(PREVIOUS_PART_INSTANCE_ID, PREVIOUS_PART_STARTED)]
): SelectedPartInstances {
	return {
		current: makeTestPartInstance(CURRENT_PART_INSTANCE_ID, CURRENT_PART_STARTED),
		previous,
		next: undefined,
		firstInSegmentPlayout: undefined,
		inCurrentSegment: [],
	} as unknown as SelectedPartInstances
}

/** `previousPartInstanceIds` is ordered most-recent-first, as `previousPartsInfo` is */
function makeTestPlaylistWithPreviousParts(previousPartInstanceIds: string[]) {
	const playlist = makeTestPlaylist()
	playlist.activationId = protectString('somethingRandom')
	playlist.currentPartInfo = {
		consumesQueuedSegmentId: false,
		manuallySelected: false,
		partInstanceId: protectString(CURRENT_PART_INSTANCE_ID),
		rundownId: playlist.rundownIdsInOrder[0],
	}
	playlist.previousPartsInfo = previousPartInstanceIds.map((partInstanceId) => ({
		consumesQueuedSegmentId: false,
		manuallySelected: false,
		partInstanceId: protectString(partInstanceId),
		rundownId: playlist.rundownIdsInOrder[0],
	}))
	return playlist
}

/** Runs the handler with the provided documents and returns the resulting collection data */
async function runHandler(
	pieceInstances: PieceInstance[],
	partInstances: SelectedPartInstances = makeTestPartInstances(),
	previousPartInstanceIds: string[] = [PREVIOUS_PART_INSTANCE_ID]
): Promise<SelectedPieceInstances | undefined> {
	const handlers = makeMockHandlers()
	const handler = new PieceInstancesHandler(makeMockLogger(), makeMockCoreHandler(pieceInstances))
	handler.init(handlers)

	let data: SelectedPieceInstances | undefined
	handler.subscribe((newData) => {
		data = newData as SelectedPieceInstances
	})

	handlers.showStyleBaseHandler.notify({ sourceLayers: {} } as ShowStyleBaseExt)
	handlers.partInstancesHandler.notify(partInstances)
	handlers.playlistHandler.notify(makeTestPlaylistWithPreviousParts(previousPartInstanceIds))

	// the subscription is set up asynchronously, and the data is only recomputed once it has been
	await new Promise((resolve) => setImmediate(resolve))

	return data
}

function activePieceIds(data: SelectedPieceInstances | undefined): string[] {
	return (data?.active ?? []).map((pieceInstance) => String(pieceInstance._id))
}

function makeTestInfinitePieceInstance(
	id: string,
	partInstanceId: string,
	infiniteInstanceIndex: number,
	props: PartialDeep<PieceInstance> = {}
) {
	const { piece, ...pieceInstanceProps } = props

	return makeTestPieceInstance(id, partInstanceId, {
		...pieceInstanceProps,
		piece: { lifespan: PieceLifespan.OutOnSegmentEnd, ...piece },
		infinite: {
			infiniteInstanceId: protectString(INFINITE_INSTANCE_ID),
			infiniteInstanceIndex,
			infinitePieceId: protectString('INFINITE_PIECE'),
			fromPreviousPart: infiniteInstanceIndex > 0,
		},
	})
}

describe('PieceInstancesHandler', () => {
	beforeEach(() => {
		jest.useFakeTimers({ doNotFake: ['setImmediate'] }).setSystemTime(NOW)
	})

	afterEach(() => {
		jest.useRealTimers()
	})

	it('reports pieces of the current and previous part as active', async () => {
		const data = await runHandler([
			makeSentinelPieceInstance(),
			makeTestPieceInstance('CURRENT_PIECE', CURRENT_PART_INSTANCE_ID),
			makeTestPieceInstance('PREVIOUS_PIECE', PREVIOUS_PART_INSTANCE_ID, {
				piece: { sourceLayerId: 'layer1' },
			}),
		])

		expect(activePieceIds(data)).toEqual(['SENTINEL', 'CURRENT_PIECE', 'PREVIOUS_PIECE'])
	})

	it('does not report a piece of a previous part that has reported a stop', async () => {
		const data = await runHandler([
			makeSentinelPieceInstance(),
			// a previous part's pieces have a definite end on the timeline, so they report a stop
			// once the keepalive/postroll carried into the current part has elapsed
			makeTestPieceInstance('PREVIOUS_PIECE', PREVIOUS_PART_INSTANCE_ID, {
				piece: { sourceLayerId: 'layer1' },
				reportedStartedPlayback: PREVIOUS_PART_STARTED,
				reportedStoppedPlayback: NOW - 500,
			}),
		])

		expect(activePieceIds(data)).toEqual(['SENTINEL'])
	})

	it('does not report a piece with a reported stop', async () => {
		const data = await runHandler([
			makeSentinelPieceInstance(),
			makeTestPieceInstance('CURRENT_PIECE', CURRENT_PART_INSTANCE_ID, {
				reportedStartedPlayback: CURRENT_PART_STARTED,
				reportedStoppedPlayback: NOW - 500,
			}),
		])

		expect(activePieceIds(data)).toEqual(['SENTINEL'])
	})

	it('reports a continued infinite piece only once', async () => {
		const data = await runHandler([
			makeSentinelPieceInstance(),
			makeTestInfinitePieceInstance('CURRENT_INFINITE', CURRENT_PART_INSTANCE_ID, 1),
			makeTestInfinitePieceInstance('PREVIOUS_INFINITE', PREVIOUS_PART_INSTANCE_ID, 0),
		])

		expect(activePieceIds(data)).toEqual(['SENTINEL', 'CURRENT_INFINITE'])
	})

	it('does not report a continued infinite piece stopped by a virtual piece in the current part', async () => {
		const data = await runHandler([
			makeSentinelPieceInstance(),
			makeTestInfinitePieceInstance('CURRENT_INFINITE', CURRENT_PART_INSTANCE_ID, 1),
			// stopping an infinite piece inserts a virtual piece into the current part only
			makeTestPieceInstance('CURRENT_VIRTUAL', CURRENT_PART_INSTANCE_ID, {
				piece: {
					enable: { start: 500 },
					lifespan: PieceLifespan.OutOnSegmentEnd,
					virtual: true,
				},
			}),
			makeTestInfinitePieceInstance('PREVIOUS_INFINITE', PREVIOUS_PART_INSTANCE_ID, 0),
		])

		expect(activePieceIds(data)).toEqual(['SENTINEL'])
	})

	it('does not report a continued infinite piece stopped with a userDuration', async () => {
		const data = await runHandler([
			makeSentinelPieceInstance(),
			// stopping a piece with an "onChange" lifespan crops the copy in the current part only
			makeTestInfinitePieceInstance('CURRENT_INFINITE', CURRENT_PART_INSTANCE_ID, 1, {
				piece: { lifespan: PieceLifespan.OutOnSegmentChange },
				userDuration: { endRelativeToPart: 500 },
			}),
			makeTestInfinitePieceInstance('PREVIOUS_INFINITE', PREVIOUS_PART_INSTANCE_ID, 0, {
				piece: { lifespan: PieceLifespan.OutOnSegmentChange },
			}),
		])

		expect(activePieceIds(data)).toEqual(['SENTINEL'])
	})

	it('reports only the newest copy of an infinite piece spanning several previous parts', async () => {
		const data = await runHandler(
			[
				makeSentinelPieceInstance(),
				makeTestInfinitePieceInstance('PREVIOUS_INFINITE', PREVIOUS_PART_INSTANCE_ID, 1),
				makeTestInfinitePieceInstance('OLDER_INFINITE', OLDER_PART_INSTANCE_ID, 0),
			],
			makeTestPartInstances([
				makeTestPartInstance(PREVIOUS_PART_INSTANCE_ID, PREVIOUS_PART_STARTED),
				makeTestPartInstance(OLDER_PART_INSTANCE_ID, OLDER_PART_STARTED),
			]),
			[PREVIOUS_PART_INSTANCE_ID, OLDER_PART_INSTANCE_ID]
		)

		expect(activePieceIds(data)).toEqual(['SENTINEL', 'PREVIOUS_INFINITE'])
	})

	it('resolves the timings of a previous part against its own part instance', async () => {
		const data = await runHandler(
			[
				makeSentinelPieceInstance(),
				// this piece is 5000ms into a part that started 3000ms ago, so it has not started playing yet
				makeTestPieceInstance('PREVIOUS_LATE_PIECE', PREVIOUS_PART_INSTANCE_ID, {
					piece: { enable: { start: 5000 }, sourceLayerId: 'layer1' },
				}),
				makeTestPieceInstance('OLDER_PIECE', OLDER_PART_INSTANCE_ID, {
					piece: { sourceLayerId: 'layer2' },
				}),
			],
			// the part instances are not necessarily in the same order as previousPartsInfo,
			// as they are only the ones that could be found in the collection
			makeTestPartInstances([
				makeTestPartInstance(OLDER_PART_INSTANCE_ID, OLDER_PART_STARTED),
				makeTestPartInstance(PREVIOUS_PART_INSTANCE_ID, PREVIOUS_PART_STARTED),
			]),
			[PREVIOUS_PART_INSTANCE_ID, OLDER_PART_INSTANCE_ID]
		)

		expect(activePieceIds(data)).toEqual(['SENTINEL', 'OLDER_PIECE'])
	})
})
