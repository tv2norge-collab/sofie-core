import { TimelineObjectCoreExt } from '@sofie-automation/blueprints-integration'
import { DBPart, isPartPlayable } from '@sofie-automation/corelib/dist/dataModel/Part'
import { DBPartInstance } from '@sofie-automation/corelib/dist/dataModel/PartInstance'
import { Piece } from '@sofie-automation/corelib/dist/dataModel/Piece'
import { PieceInstance, PieceInstancePiece } from '@sofie-automation/corelib/dist/dataModel/PieceInstance'
import { PartCalculatedTimings } from '@sofie-automation/corelib/dist/playout/timings'
import { ReadonlyDeep } from 'type-fest'
import { JobContext } from '../../jobs'
import { PlayoutModel } from '../model/PlayoutModel'
import { selectNextPart } from '../selectNextPart'

export interface PartInstanceAndPieceInstances {
	part: ReadonlyDeep<DBPartInstance>
	onTimeline: boolean
	nowInPart: number
	allPieces: ReadonlyDeep<PieceInstance[]>
	calculatedTimings: PartCalculatedTimings
}
export interface PieceInstanceWithObjectMap extends ReadonlyDeep<PieceInstance> {
	/** Cache of objects built by findObjects. */
	objectMap?: Map<string, TimelineObjectCoreExt<any>>
}
export interface PartAndPieces {
	part: ReadonlyDeep<DBPart>
	/** Whether the inTransition from this part should be considered */
	usesInTransition: boolean
	pieces: PieceInstanceWithObjectMap[]
}

export function isPieceInstance(piece: Piece | PieceInstance | PieceInstancePiece): piece is PieceInstance {
	const tmpPiece = piece as PieceInstance
	return typeof tmpPiece.piece !== 'undefined'
}

/**
 * Excludes the previous, current and next part
 */
export function getOrderedPartsAfterPlayhead(
	context: JobContext,
	cache: PlayoutModel,
	partCount: number
): ReadonlyDeep<DBPart>[] {
	if (partCount <= 0) {
		return []
	}
	const span = context.startSpan('getOrderedPartsAfterPlayhead')

	const playlist = cache.Playlist
	const orderedSegments = cache.getAllOrderedSegments()
	const orderedParts = cache.getAllOrderedParts()
	const currentPartInstance = cache.CurrentPartInstance?.PartInstance
	const nextPartInstance = cache.NextPartInstance?.PartInstance

	// If the nextPartInstance consumes the
	const alreadyConsumedQueuedSegmentId =
		nextPartInstance && (!currentPartInstance || currentPartInstance.segmentId !== nextPartInstance.segmentId)

	const strippedPlaylist = {
		queuedSegmentId: alreadyConsumedQueuedSegmentId ? undefined : playlist.queuedSegmentId,
		loop: playlist.loop,
	}
	const nextNextPart = selectNextPart(
		context,
		strippedPlaylist,
		nextPartInstance ?? currentPartInstance ?? null,
		null,
		orderedSegments,
		orderedParts
	)
	if (!nextNextPart) {
		// We don't know where to begin searching, so we can't do anything
		return []
	}

	const playablePartsSlice = orderedParts.slice(nextNextPart.index).filter((p) => isPartPlayable(p))

	const res: ReadonlyDeep<DBPart>[] = []

	const nextSegmentIndex = playablePartsSlice.findIndex((p) => p.segmentId === playlist.queuedSegmentId)
	if (
		playlist.queuedSegmentId &&
		!alreadyConsumedQueuedSegmentId &&
		nextSegmentIndex !== -1 &&
		!nextNextPart.consumesQueuedSegmentId
	) {
		// TODO - this if clause needs some decent testing

		// Push the next part and the remainder of its segment
		res.push(...playablePartsSlice.filter((p) => p.segmentId === nextNextPart.part.segmentId))

		// Push from nextSegmentId to the end of the playlist
		res.push(...playablePartsSlice.slice(nextSegmentIndex))
	} else {
		// Push as many parts as we want
		res.push(...playablePartsSlice)
	}

	if (res.length < partCount && playlist.loop) {
		// The rundown would loop here, so lets run with that
		const playableParts = orderedParts.filter((p) => isPartPlayable(p))
		// Note: We only add it once, as lookahead is unlikely to show anything new in a second pass
		res.push(...playableParts)

		if (span) span.end()
		// Final trim to ensure it is within bounds
		return res.slice(0, partCount)
	} else {
		if (span) span.end()
		// We reached the target or ran out of parts
		return res.slice(0, partCount)
	}
}
