import { isTooCloseToAutonext } from '../playout/lib'
import { selectNextPart } from '../playout/selectNextPart'
import {
	CacheForPlayout,
	getOrderedSegmentsAndPartsFromPlayoutCache,
	getSelectedPartInstancesFromCache,
} from '../playout/cache'
import { JobContext } from '../jobs'
import { setNextPart } from '../playout/setNext'
import { isPartPlayable } from '@sofie-automation/corelib/dist/dataModel/Part'

/**
 * Make sure that the nextPartInstance for the current Playlist is still correct
 * This will often change the nextPartInstance
 * @param context Context of the job being run
 * @param cache Playout Cache to operate on
 * @returns Whether the timeline should be updated following this operation
 */
export async function ensureNextPartIsValid(context: JobContext, cache: CacheForPlayout): Promise<boolean> {
	const span = context.startSpan('api.ingest.ensureNextPartIsValid')

	// Ensure the next-id is still valid
	const playlist = cache.Playlist.doc
	if (!playlist?.activationId) {
		span?.end()
		return false
	}

	const { currentPartInstance, nextPartInstance } = getSelectedPartInstancesFromCache(cache)

	if (
		playlist.nextPartInfo?.manuallySelected &&
		nextPartInstance?.part &&
		isPartPlayable(nextPartInstance.part) &&
		nextPartInstance.orphaned !== 'deleted'
	) {
		// Manual next part is almost always valid. This includes orphaned (adlib-part) partinstances
		span?.end()
		return false
	}

	// If we are close to an autonext, then leave it to avoid glitches
	if (isTooCloseToAutonext(currentPartInstance) && nextPartInstance) {
		span?.end()
		return false
	}

	const allPartsAndSegments = getOrderedSegmentsAndPartsFromPlayoutCache(cache)

	if (currentPartInstance && nextPartInstance) {
		// Check if the part is the same
		const newNextPart = selectNextPart(
			context,
			playlist,
			currentPartInstance,
			nextPartInstance,
			allPartsAndSegments
		)

		if (
			// Nothing should be nexted
			!newNextPart ||
			// The nexted-part should be different to what is selected
			newNextPart.part._id !== nextPartInstance.part._id ||
			// The nexted-part Instance is no longer playable
			!isPartPlayable(nextPartInstance.part)
		) {
			// The 'new' next part is before the current next, so move the next point
			await setNextPart(context, cache, newNextPart ?? null, false)

			span?.end()
			return true
		}
	} else if (!nextPartInstance || nextPartInstance.orphaned === 'deleted') {
		// Don't have a nextPart or it has been deleted, so autoselect something
		const newNextPart = selectNextPart(
			context,
			playlist,
			currentPartInstance ?? null,
			nextPartInstance ?? null,
			allPartsAndSegments
		)

		if (!newNextPart && !cache.Playlist.doc?.nextPartInfo) {
			// No currently nexted part, and nothing was selected, so nothing to update
			span?.end()
			return false
		}

		await setNextPart(context, cache, newNextPart ?? null, false)

		span?.end()
		return true
	}

	span?.end()
	return false
}
