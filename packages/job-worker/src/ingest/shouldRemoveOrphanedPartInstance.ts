import {
	BlueprintRemoveOrphanedPartInstance,
	ShowStyleBlueprintManifest,
} from '@sofie-automation/blueprints-integration'
import { PartNote, SegmentNote } from '@sofie-automation/corelib/dist/dataModel/Notes'
import { Rundown } from '@sofie-automation/corelib/dist/dataModel/Rundown'
import { ShowStyleCompound } from '@sofie-automation/corelib/dist/dataModel/ShowStyleCompound'
import { literal, stringifyError } from '@sofie-automation/corelib/dist/lib'
import { JobContext } from '../jobs'
import { ReadonlyDeep } from 'type-fest'
import { clone } from 'underscore'
import { RundownUserContext } from '../blueprints/context'
import { CacheForPlayout, getSelectedPartInstancesFromCache } from '../playout/cache'
import { isTooCloseToAutonext } from '../playout/lib'
import { convertPartInstanceToBlueprints, convertPieceInstanceToBlueprints } from '../blueprints/context/lib'
import { logger } from '../logging'

export async function shouldRemoveOrphanedPartInstance(
	context: JobContext,
	cache: CacheForPlayout,
	showStyle: ReadonlyDeep<ShowStyleCompound>,
	blueprint: ReadonlyDeep<ShowStyleBlueprintManifest>,
	rundown: ReadonlyDeep<Rundown>
): Promise<void> {
	if (!cache.Playlist.doc.activationId) return
	if (!blueprint.shouldRemoveOrphanedPartInstance) return

	const playlistPartInstances = getSelectedPartInstancesFromCache(cache)
	if (!playlistPartInstances.nextPartInstance?.orphaned) return

	const orphanedPartInstance = playlistPartInstances.nextPartInstance
	const pieceInstancesInPart = cache.PieceInstances.findFetch((p) => p.partInstanceId === orphanedPartInstance._id)

	const existingResultPartInstance: BlueprintRemoveOrphanedPartInstance = {
		partInstance: convertPartInstanceToBlueprints(orphanedPartInstance),
		pieceInstances: pieceInstancesInPart.map(convertPieceInstanceToBlueprints),
	}

	const orphanedPartInstanceContext = new RundownUserContext(
		{
			name: `Update to ${orphanedPartInstance.part.externalId}`,
			identifier: `rundownId=${orphanedPartInstance.part.rundownId},segmentId=${orphanedPartInstance.part.segmentId}`,
		},
		context.studio,
		context.getStudioBlueprintConfig(),
		showStyle,
		context.getShowStyleBlueprintConfig(showStyle),
		rundown
	)

	let shouldRemoveInstance = false
	try {
		shouldRemoveInstance = blueprint.shouldRemoveOrphanedPartInstance(
			orphanedPartInstanceContext,
			clone(existingResultPartInstance)
		)
	} catch (err) {
		logger.error(`Error in showStyleBlueprint.shouldRemoveOrphanedPartInstance: ${stringifyError(err)}`)
	}

	// Save notes:
	if (!orphanedPartInstance.part.notes) orphanedPartInstance.part.notes = []
	const notes: PartNote[] = orphanedPartInstance.part.notes
	let changed = false
	for (const note of orphanedPartInstanceContext.notes) {
		changed = true
		notes.push(
			literal<SegmentNote>({
				type: note.type,
				message: note.message,
				origin: {
					name: '',
				},
			})
		)
	}
	if (changed) {
		cache.PartInstances.updateOne(orphanedPartInstance._id, (p) => {
			p.part.notes = notes
			return p
		})
	}

	if (shouldRemoveInstance && !isTooCloseToAutonext(playlistPartInstances.currentPartInstance)) {
		cache.PartInstances.updateOne(orphanedPartInstance._id, (p) => {
			p.reset = true
			return p
		})
		cache.Playlist.update((p) => {
			p.nextPartInstanceId = null
			return p
		})
	}
}
