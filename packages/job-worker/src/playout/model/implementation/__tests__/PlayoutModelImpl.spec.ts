import { mock } from 'jest-mock-extended'
import { protectString } from '@sofie-automation/corelib/dist/protectedString'
import { PartInstanceId, RundownPlaylistId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import { DBPartInstance } from '@sofie-automation/corelib/dist/dataModel/PartInstance'
import { SelectedPartInstance } from '@sofie-automation/corelib/dist/dataModel/RundownPlaylist'
import { PlaylistLock } from '../../../../jobs/lock'
import { PlayoutModelImpl } from '../PlayoutModelImpl'
import { setupDefaultJobEnvironment } from '../../../../__mocks__/context'
import { defaultRundownPlaylist } from '../../../../__mocks__/defaultCollectionObjects'

describe('PlayoutModelImpl', () => {
	const playlistId = protectString<RundownPlaylistId>('playlist0')
	const studioId = protectString('studio0')

	function makePartInstance(id: string, reportedStoppedPlayback?: number): DBPartInstance {
		return {
			_id: protectString<PartInstanceId>(id),
			rundownId: protectString('rd0'),
			segmentId: protectString('seg0'),
			playlistActivationId: protectString('act0'),
			segmentPlayoutId: protectString('segpayout0'),
			rehearsal: false,
			takeCount: 0,
			part: {
				_id: protectString(id + '_part'),
				_rank: 0,
				rundownId: protectString('rd0'),
				segmentId: protectString('seg0'),
				externalId: id,
				title: id,
				expectedDurationWithTransition: undefined,
			},
			...(reportedStoppedPlayback !== undefined ? { timings: { setAsNext: 0, reportedStoppedPlayback } } : {}),
		}
	}

	function makeSelectedPartInfo(partInstanceId: string): SelectedPartInstance {
		return {
			partInstanceId: protectString<PartInstanceId>(partInstanceId),
			rundownId: protectString('rd0'),
			manuallySelected: false,
			consumesQueuedSegmentId: false,
		}
	}

	function createModel(
		partInstances: DBPartInstance[],
		playlistOverrides?: {
			currentPartInfo?: SelectedPartInstance | null
			nextPartInfo?: SelectedPartInstance | null
			previousPartsInfo?: SelectedPartInstance[]
		}
	): PlayoutModelImpl {
		const context = setupDefaultJobEnvironment()
		const playlist = {
			...defaultRundownPlaylist(playlistId, studioId),
			...(playlistOverrides ?? {}),
		}
		return new PlayoutModelImpl(
			context,
			mock<PlaylistLock>(),
			playlistId,
			[],
			playlist,
			partInstances,
			new Map(),
			[],
			undefined
		)
	}

	describe('cycleSelectedPartInstances', () => {
		it('moves currentPartInfo to front of previousPartsInfo and advances current/next', () => {
			const pi0Info = makeSelectedPartInfo('pi0')
			const pi1Info = makeSelectedPartInfo('pi1')
			const model = createModel([], {
				currentPartInfo: pi0Info,
				nextPartInfo: pi1Info,
				previousPartsInfo: [],
			})

			model.cycleSelectedPartInstances()

			expect(model.playlist.previousPartsInfo).toEqual([pi0Info])
			expect(model.playlist.currentPartInfo).toEqual(pi1Info)
			expect(model.playlist.nextPartInfo).toBeNull()
		})

		it('accumulates multiple previous parts in most-recent-first order', () => {
			// Start with one entry already in previousPartsInfo and cycle in another
			const pi0Info = makeSelectedPartInfo('pi0')
			const pi1Info = makeSelectedPartInfo('pi1')
			const pi2Info = makeSelectedPartInfo('pi2')

			// pi0 is already previous, pi1 is current, pi2 is next
			const model = createModel([], {
				currentPartInfo: pi1Info,
				nextPartInfo: pi2Info,
				previousPartsInfo: [pi0Info],
			})

			model.cycleSelectedPartInstances()

			// pi1 is now most-recent previous, pi0 is older
			expect(model.playlist.previousPartsInfo).toEqual([pi1Info, pi0Info])
			expect(model.playlist.currentPartInfo).toEqual(pi2Info)
			expect(model.playlist.nextPartInfo).toBeNull()
		})

		it('does nothing to previousPartsInfo when there is no currentPartInfo', () => {
			const pi1Info = makeSelectedPartInfo('pi1')
			const model = createModel([], {
				currentPartInfo: null,
				nextPartInfo: pi1Info,
				previousPartsInfo: [],
			})

			model.cycleSelectedPartInstances()

			expect(model.playlist.previousPartsInfo).toEqual([])
		})

		it('caps previousPartsInfo at 10 entries', () => {
			// Seed with 9 existing previous entries; cycle in a 10th via current
			const existing = Array.from({ length: 9 }, (_, i) => makeSelectedPartInfo(`pi_old_${i}`))
			const current = makeSelectedPartInfo('pi_current')
			const next = makeSelectedPartInfo('pi_next')

			const model = createModel([], {
				currentPartInfo: current,
				nextPartInfo: next,
				previousPartsInfo: existing,
			})

			model.cycleSelectedPartInstances()

			expect(model.playlist.previousPartsInfo).toHaveLength(10)
			// Most recent is first
			expect(model.playlist.previousPartsInfo[0]).toEqual(current)

			// Now cycle one more in — should still be capped at 10, oldest dropped
			;(model as any).playlistImpl.currentPartInfo = next
			;(model as any).playlistImpl.nextPartInfo = makeSelectedPartInfo('pi_newer')
			model.cycleSelectedPartInstances()

			expect(model.playlist.previousPartsInfo).toHaveLength(10)
			expect(model.playlist.previousPartsInfo[0]).toEqual(next)
		})
	})

	describe('prunePreviousPartInstances', () => {
		it('keeps all entries when none have reported stopped playback', () => {
			const pi0 = makePartInstance('pi0') // no reportedStoppedPlayback
			const pi1 = makePartInstance('pi1') // no reportedStoppedPlayback
			const model = createModel([pi0, pi1], {
				previousPartsInfo: [makeSelectedPartInfo('pi0'), makeSelectedPartInfo('pi1')],
			})

			model.prunePreviousPartInstances()

			expect(model.playlist.previousPartsInfo).toHaveLength(2)
			expect(model.playlist.previousPartsInfo.map((p) => p.partInstanceId)).toEqual([
				protectString('pi0'),
				protectString('pi1'),
			])
		})

		it('removes older entries that have reported stopped, keeps active newer ones', () => {
			const pi0 = makePartInstance('pi0') // still running — most-recent
			const pi1 = makePartInstance('pi1', 1000) // stopped — older
			const model = createModel([pi0, pi1], {
				// Most-recent first
				previousPartsInfo: [makeSelectedPartInfo('pi0'), makeSelectedPartInfo('pi1')],
			})

			model.prunePreviousPartInstances()

			expect(model.playlist.previousPartsInfo).toHaveLength(1)
			expect(model.playlist.previousPartsInfo[0].partInstanceId).toEqual(protectString('pi0'))
		})

		it('always keeps at least one entry even if all have reported stopped', () => {
			const pi0 = makePartInstance('pi0', 2000) // stopped — most-recent
			const pi1 = makePartInstance('pi1', 1000) // stopped — older
			const model = createModel([pi0, pi1], {
				previousPartsInfo: [makeSelectedPartInfo('pi0'), makeSelectedPartInfo('pi1')],
			})

			model.prunePreviousPartInstances()

			// Must not drop to zero — keep index 0 (the most-recent)
			expect(model.playlist.previousPartsInfo).toHaveLength(1)
			expect(model.playlist.previousPartsInfo[0].partInstanceId).toEqual(protectString('pi0'))
		})

		it('keeps entries whose PartInstance is not loaded (unknown state — safe default)', () => {
			// pi0 is NOT passed as a loaded part instance, so it is unknown
			const model = createModel([], {
				previousPartsInfo: [makeSelectedPartInfo('pi0')],
			})

			model.prunePreviousPartInstances()

			// Unknown — should be retained, not dropped
			expect(model.playlist.previousPartsInfo).toHaveLength(1)
		})

		it('does not change previousPartsInfo when nothing needs pruning', () => {
			const pi0 = makePartInstance('pi0')
			const pi1 = makePartInstance('pi1')
			const model = createModel([pi0, pi1], {
				previousPartsInfo: [makeSelectedPartInfo('pi0'), makeSelectedPartInfo('pi1')],
			})

			const before = model.playlist.previousPartsInfo

			model.prunePreviousPartInstances()

			// Same content
			expect(model.playlist.previousPartsInfo).toEqual(before)
			expect(model.playlist.previousPartsInfo).toHaveLength(2)
		})

		it('handles an empty previousPartsInfo without crashing', () => {
			const model = createModel([], { previousPartsInfo: [] })

			expect(() => model.prunePreviousPartInstances()).not.toThrow()
			expect(model.playlist.previousPartsInfo).toHaveLength(0)
		})
	})
})
