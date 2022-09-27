import { DBPartInstance } from '@sofie-automation/corelib/dist/dataModel/PartInstance'
import { CacheForPlayout } from '../playout/cache'
import { Time } from '@sofie-automation/blueprints-integration'
import { unprotectString } from '@sofie-automation/corelib/dist/protectedString'
import { PieceInstance } from '@sofie-automation/corelib/dist/dataModel/PieceInstance'
import { JobContext } from '../jobs'
import { PartInstanceId, RundownPlaylistId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import { logger } from '../logging'
import * as debounceFn from 'debounce-fn'
import { EventsJobs } from '@sofie-automation/corelib/dist/worker/events'
import { stringifyError } from '@sofie-automation/corelib/dist/lib'

const EVENT_WAIT_TIME = 500

const partInstanceTimingDebounceFunctions = new Map<string, debounceFn.DebouncedFunction<[], void>>()

function handlePartInstanceTimingEvent(
	context: JobContext,
	playlistId: RundownPlaylistId,
	partInstanceId: PartInstanceId
): void {
	// Future: this should be workqueue backed, not in-memory

	// wait EVENT_WAIT_TIME, because blueprint.onAsRunEvent() it is likely for there to be a bunch of started and stopped events coming in at the same time
	// These blueprint methods are not time critical (meaning they do raw db operations), and can be easily delayed
	const funcId = `${playlistId}_${partInstanceId}`
	const cachedFunc = partInstanceTimingDebounceFunctions.get(funcId)
	if (cachedFunc) {
		cachedFunc()
	} else {
		const newFunc = debounceFn(
			() => {
				context
					.queueEventJob(EventsJobs.PartInstanceTimings, {
						playlistId,
						partInstanceId,
					})
					.catch((e) => {
						logger.error(
							`Failed to queue job in handlePartInstanceTimingEvent "${funcId}": "${stringifyError(e)}"`
						)
					})
			},
			{
				before: false,
				after: true,
				wait: EVENT_WAIT_TIME,
			}
		)
		partInstanceTimingDebounceFunctions.set(funcId, newFunc)
		newFunc()
	}
}

export function reportPartInstanceHasStarted(
	context: JobContext,
	cache: CacheForPlayout,
	partInstance: DBPartInstance,
	timestamp: Time
): void {
	if (partInstance) {
		let timestampUpdated = false
		// If timings.startedPlayback has already been set, we shouldn't set it to another value:
		if (!partInstance.timings?.startedPlayback) {
			cache.PartInstances.updateOne(partInstance._id, (p) => {
				p.isTaken = true
				if (!p.timings) p.timings = {}
				p.timings.startedPlayback = timestamp
				return p
			})
			timestampUpdated = true

			// Unset stoppedPlayback if it is set:
			if (partInstance.timings?.stoppedPlayback) {
				cache.PartInstances.updateOne(partInstance._id, (p) => {
					if (p.timings) delete p.timings.stoppedPlayback
					return p
				})
			}
		}
		// Update the playlist:
		cache.Playlist.update((playlist) => {
			if (!playlist.rundownsStartedPlayback) {
				playlist.rundownsStartedPlayback = {}
			}

			// If the partInstance is "untimed", it will not update the playlist's startedPlayback and will not count time in the GUI:
			if (!partInstance.part.untimed) {
				const rundownId = unprotectString(partInstance.rundownId)
				if (!playlist.rundownsStartedPlayback[rundownId]) {
					playlist.rundownsStartedPlayback[rundownId] = timestamp
				}

				if (!playlist.startedPlayback) {
					playlist.startedPlayback = timestamp
				}
			}

			return playlist
		})

		if (timestampUpdated) {
			cache.deferAfterSave(() => {
				// Run in the background, we don't want to hold onto the lock to do this
				handlePartInstanceTimingEvent(context, cache.PlaylistId, partInstance._id)
			})
		}
	}
}
export function reportPartInstanceHasStopped(
	context: JobContext,
	cache: CacheForPlayout,
	partInstance: DBPartInstance,
	timestamp: Time
): void {
	let timestampUpdated = false
	if (!partInstance.timings?.stoppedPlayback) {
		cache.PartInstances.updateOne(partInstance._id, (p) => {
			if (!p.timings) p.timings = {}
			p.timings.stoppedPlayback = timestamp
			return p
		})
		timestampUpdated = true
	}

	if (timestampUpdated) {
		cache.deferAfterSave(() => {
			// Run in the background, we don't want to hold onto the lock to do this
			handlePartInstanceTimingEvent(context, cache.PlaylistId, partInstance._id)
		})
	}
}

export function reportPieceHasStarted(
	context: JobContext,
	cache: CacheForPlayout,
	pieceInstance: PieceInstance,
	timestamp: Time
): void {
	if (pieceInstance.startedPlayback !== timestamp) {
		cache.PieceInstances.updateOne(pieceInstance._id, (p) => {
			p.startedPlayback = timestamp
			p.stoppedPlayback = 0
			return p
		})
		// Update the copy in the next-part if there is one, so that the infinite has the same start after a take
		const playlist = cache.Playlist.doc
		if (pieceInstance.infinite && playlist.nextPartInstanceId) {
			const infiniteInstanceId = pieceInstance.infinite.infiniteInstanceId
			cache.PieceInstances.updateAll((p) => {
				if (
					p.partInstanceId === playlist.nextPartInstanceId &&
					!!p.infinite &&
					p.infinite.infiniteInstanceId === infiniteInstanceId
				) {
					p.startedPlayback = timestamp
					p.stoppedPlayback = 0
					return p
				} else {
					return false
				}
			})
		}
		cache.deferAfterSave(() => {
			handlePartInstanceTimingEvent(context, playlist._id, pieceInstance.partInstanceId)
		})
	}
}
export function reportPieceHasStopped(
	context: JobContext,
	cache: CacheForPlayout,
	pieceInstance: PieceInstance,
	timestamp: Time
): void {
	if (pieceInstance.stoppedPlayback !== timestamp) {
		cache.PieceInstances.updateOne(pieceInstance._id, (p) => {
			p.stoppedPlayback = timestamp
			return p
		})
		cache.deferAfterSave(() => {
			handlePartInstanceTimingEvent(context, cache.PlaylistId, pieceInstance.partInstanceId)
		})
	}
}
