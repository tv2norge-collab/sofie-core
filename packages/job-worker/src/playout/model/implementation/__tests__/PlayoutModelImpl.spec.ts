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

		it('caps previousPartsInfo at 3 entries', () => {
			// Seed with 2 existing previous entries; cycle in a 3rd via current
			const existing = Array.from({ length: 2 }, (_, i) => makeSelectedPartInfo(`pi_old_${i}`))
			const current = makeSelectedPartInfo('pi_current')
			const next = makeSelectedPartInfo('pi_next')

			const model = createModel([], {
				currentPartInfo: current,
				nextPartInfo: next,
				previousPartsInfo: existing,
			})

			model.cycleSelectedPartInstances()

			expect(model.playlist.previousPartsInfo).toHaveLength(3)
			// Most recent is first
			expect(model.playlist.previousPartsInfo[0]).toEqual(current)

			// Now cycle one more in — should still be capped at 3, oldest dropped
			;(model as any).playlistImpl.currentPartInfo = next
			;(model as any).playlistImpl.nextPartInfo = makeSelectedPartInfo('pi_newer')
			model.cycleSelectedPartInstances()

			expect(model.playlist.previousPartsInfo).toHaveLength(3)
			expect(model.playlist.previousPartsInfo[0]).toEqual(next)
		})
	})

	describe('cycleSelectedPartInstances pruning of stopped entries', () => {
		it('caps previousPartsInfo at 3 entries', () => {
			const existing = Array.from({ length: 3 }, (_, i) => makeSelectedPartInfo(`pi_old_${i}`))
			const current = makeSelectedPartInfo('pi_current')
			const next = makeSelectedPartInfo('pi_next')

			const model = createModel([], {
				currentPartInfo: current,
				nextPartInfo: next,
				previousPartsInfo: existing,
			})

			model.cycleSelectedPartInstances()

			expect(model.playlist.previousPartsInfo).toHaveLength(3)
			expect(model.playlist.previousPartsInfo[0]).toEqual(current)
			// oldest entry dropped
			expect(model.playlist.previousPartsInfo.map((p) => p.partInstanceId)).not.toContain(
				protectString('pi_old_2')
			)
		})

		it('does not exceed 3 entries across multiple cycles', () => {
			const model = createModel([], {
				currentPartInfo: makeSelectedPartInfo('pi0'),
				nextPartInfo: makeSelectedPartInfo('pi1'),
				previousPartsInfo: [],
			})

			for (let i = 1; i <= 5; i++) {
				model.cycleSelectedPartInstances()
				;(model as any).playlistImpl.currentPartInfo = makeSelectedPartInfo(`pi${i}`)
				;(model as any).playlistImpl.nextPartInfo = makeSelectedPartInfo(`pi${i + 1}`)
			}
			model.cycleSelectedPartInstances()

			expect(model.playlist.previousPartsInfo.length).toBeLessThanOrEqual(3)
		})
	})
})
