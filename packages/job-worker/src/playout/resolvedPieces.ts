import { PieceInstanceInfiniteId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import { ResolvedPieceInstance } from '@sofie-automation/corelib/dist/dataModel/PieceInstance'
import { SourceLayers } from '@sofie-automation/corelib/dist/dataModel/ShowStyleBase'
import { JobContext } from '../jobs'
import { getCurrentTime } from '../lib'
import {
	processAndPrunePieceInstanceTimings,
	resolvePrunedPieceInstance,
} from '@sofie-automation/corelib/dist/playout/processAndPrune'
import { SelectedPartInstancesTimelineInfo } from './timeline/generate'
import { PlayoutPartInstanceModel } from './model/PlayoutPartInstanceModel'
import { logger } from '../logging'

/**
 * Resolve the PieceInstances for a PartInstance
 * Uses the getCurrentTime() as approximation for 'now'
 * @param context Context for current job
 * @param sourceLayers SourceLayers for the current ShowStyle
 * @param partInstance PartInstance to resolve
 * @returns ResolvedPieceInstances sorted by startTime
 */
export function getResolvedPiecesForCurrentPartInstance(
	_context: JobContext,
	sourceLayers: SourceLayers,
	partInstance: PlayoutPartInstanceModel,
	now?: number
): ResolvedPieceInstance[] {
	if (now === undefined) now = getCurrentTime()

	const partStarted = partInstance.partInstance.timings?.plannedStartedPlayback
	const nowInPart = partStarted ? now - partStarted : 0

	const preprocessedPieces = processAndPrunePieceInstanceTimings(
		sourceLayers,
		partInstance.pieceInstances.map((p) => p.pieceInstance),
		nowInPart
	)
	return preprocessedPieces.map((instance) => resolvePrunedPieceInstance(nowInPart, instance))
}

export function getResolvedPiecesForPartInstancesOnTimeline(
	_context: JobContext,
	partInstancesInfo: SelectedPartInstancesTimelineInfo,
	now: number
): ResolvedPieceInstance[] {
	// With no current part, there are no timings to consider
	if (!partInstancesInfo.current) return []

	const currentPartStarted = partInstancesInfo.current.partStarted ?? now

	const nextPartStarted =
		partInstancesInfo.current.partInstance.part.autoNext &&
		partInstancesInfo.current.partInstance.part.expectedDuration !== 0 &&
		partInstancesInfo.current.partInstance.part.expectedDuration !== undefined
			? currentPartStarted + partInstancesInfo.current.partInstance.part.expectedDuration
			: null

	// Calculate the next part if needed
	let nextResolvedPieces: ResolvedPieceInstance[] = []
	if (partInstancesInfo.next && nextPartStarted != null) {
		const nowInPart = partInstancesInfo.next.nowInPart
		nextResolvedPieces = partInstancesInfo.next.pieceInstances.map((instance) =>
			resolvePrunedPieceInstance(nowInPart, instance)
		)

		// Translate start to absolute times
		offsetResolvedStartAndCapDuration(nextResolvedPieces, nextPartStarted, null)
	}

	// Calculate the current part
	const nowInCurrentPart = partInstancesInfo.current.nowInPart
	const currentResolvedPieces = partInstancesInfo.current.pieceInstances.map((instance) =>
		resolvePrunedPieceInstance(nowInCurrentPart, instance)
	)

	// Translate start to absolute times
	offsetResolvedStartAndCapDuration(currentResolvedPieces, currentPartStarted, nextPartStarted)

	// Calculate the previous part
	let previousResolvedPieces: ResolvedPieceInstance[] = []
	if (partInstancesInfo.previous?.partStarted) {
		const nowInPart = partInstancesInfo.previous.nowInPart
		previousResolvedPieces = partInstancesInfo.previous.pieceInstances.map((instance) =>
			resolvePrunedPieceInstance(nowInPart, instance)
		)

		const previousPartKeepaliveDuration =
			partInstancesInfo.current.partInstance.part.inTransition?.previousPartKeepaliveDuration ?? 0

		if (previousPartKeepaliveDuration > 0) {
			// During a stinger/wipe transition, the blueprint's onTimelineGenerate holds the
			// previous part's clip alive for keepaliveDuration ms via a keepalive timeline object.
			// The clip piece's session naturally ends at T+0ms (when the new part becomes current),
			// which makes the player appear "clear now" to the AB resolver (safeNow = now + nowWindow).
			// Extending the session end cap doesn't help because the clip already ends at T, so
			// Math.min(clipDuration, cap) = clipDuration — the cap is a no-op.
			// Instead, mark AB-session pieces as open-ended (resolvedDuration = undefined).
			// An open-ended session is excluded from lastSessionPerSlot in assignPlayersForLookahead,
			// so no future lookahead gets placed on the previous player during the stinger/keepalive window.
			// Translate start to absolute times (no end cap)
			logger.debug(
				`[AB_KEEPALIVE] previousPartKeepaliveDuration=${previousPartKeepaliveDuration} — marking AB-session pieces as open-ended to block lookahead assignment`
			)
			offsetResolvedStartAndCapDuration(previousResolvedPieces, partInstancesInfo.previous.partStarted, null)
			for (const piece of previousResolvedPieces) {
				if (piece.instance.piece.abSessions?.length) {
					logger.debug(
						`[AB_KEEPALIVE] open-ending piece "${piece.instance._id}" (was resolvedDuration=${piece.resolvedDuration}) to exclude from lastSessionPerSlot`
					)
					delete piece.resolvedDuration
				}
			}
		} else {
			// Translate start to absolute times, capped at when the current part started
			offsetResolvedStartAndCapDuration(
				previousResolvedPieces,
				partInstancesInfo.previous.partStarted,
				currentPartStarted
			)
		}
	}

	return mergeInfinitesIntoCurrentPart(previousResolvedPieces, currentResolvedPieces, nextResolvedPieces)
}

function offsetResolvedStartAndCapDuration(
	pieces: ResolvedPieceInstance[],
	partStarted: number,
	endCap: number | null
) {
	for (const piece of pieces) {
		piece.resolvedStart += partStarted

		if (endCap !== null) {
			// Cap it to the end of the Part. If it is supposed to be longer, there will be a continuing infinite
			const partEndCap = endCap - piece.resolvedStart

			piece.resolvedDuration =
				piece.resolvedDuration !== undefined ? Math.min(piece.resolvedDuration, partEndCap) : partEndCap
		}
	}
}

function mergeInfinitesIntoCurrentPart(
	previousResolvedPieces: ResolvedPieceInstance[],
	currentResolvedPieces: ResolvedPieceInstance[],
	nextResolvedPieces: ResolvedPieceInstance[]
): ResolvedPieceInstance[] {
	// Build a map of the infinite pieces from the current Part
	const currentInfinitePieces = new Map<PieceInstanceInfiniteId, ResolvedPieceInstance>()
	for (const resolvedPiece of currentResolvedPieces) {
		if (resolvedPiece.instance.infinite) {
			currentInfinitePieces.set(resolvedPiece.instance.infinite.infiniteInstanceId, resolvedPiece)
		}
	}

	const resultingPieces: ResolvedPieceInstance[] = [...currentResolvedPieces]

	// Merge any infinite chains between the previous and current parts
	for (const resolvedPiece of previousResolvedPieces) {
		if (resolvedPiece.instance.infinite) {
			const continuingInfinite = currentInfinitePieces.get(resolvedPiece.instance.infinite.infiniteInstanceId)
			if (continuingInfinite) {
				// Extend the duration to compensate for the moved start
				if (continuingInfinite.resolvedDuration !== undefined) {
					continuingInfinite.resolvedDuration +=
						continuingInfinite.resolvedStart - resolvedPiece.resolvedStart
				}

				// Move the start time to be for the previous Piece
				continuingInfinite.resolvedStart = resolvedPiece.resolvedStart

				continue
			}
		}

		resultingPieces.push(resolvedPiece)
	}

	// Merge any infinite chains between the current and next parts
	for (const resolvedPiece of nextResolvedPieces) {
		if (resolvedPiece.instance.infinite) {
			const continuingInfinite = currentInfinitePieces.get(resolvedPiece.instance.infinite.infiniteInstanceId)
			if (continuingInfinite) {
				// Update the duration to be based upon the copy from the next part
				if (resolvedPiece.resolvedDuration !== undefined) {
					continuingInfinite.resolvedDuration =
						resolvedPiece.resolvedDuration + resolvedPiece.resolvedStart - continuingInfinite.resolvedStart
				} else {
					delete continuingInfinite.resolvedDuration
				}

				continue
			}
		}

		resultingPieces.push(resolvedPiece)
	}

	return resultingPieces
}
