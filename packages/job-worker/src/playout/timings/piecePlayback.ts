import { PartInstanceId, PieceInstanceId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import { logger } from '../../logging'
import { JobContext } from '../../jobs'
import { PlayoutModel } from '../model/PlayoutModel'
import { Time } from '@sofie-automation/blueprints-integration'
import { PlayoutPartInstanceModel } from '../model/PlayoutPartInstanceModel'
import { PlayoutPieceInstanceModel } from '../model/PlayoutPieceInstanceModel'

/**
 * Set the playback of a piece is confirmed to have started
 * @param context Context from the job queue
 * @param cache DB cache for the current playlist
 * @param data Details on the piece start event
 */
export function onPiecePlaybackStarted(
	context: JobContext,
	cache: PlayoutModel,
	data: {
		partInstanceId: PartInstanceId
		pieceInstanceId: PieceInstanceId
		startedPlayback: Time
	}
): void {
	const playlist = cache.Playlist

	const partInstance = cache.getPartInstance(data.partInstanceId)
	if (!partInstance) {
		if (!playlist.activationId) {
			logger.warn(`onPiecePlaybackStarted: Received for inactive RundownPlaylist "${playlist._id}"`)
		} else {
			throw new Error(`PartInstance "${data.partInstanceId}" in RundownPlaylist "${playlist._id}" not found!`)
		}
		return
	}

	const pieceInstance = partInstance.getPieceInstance(data.pieceInstanceId)
	if (!pieceInstance) {
		if (!playlist.activationId) {
			logger.warn(`onPiecePlaybackStarted: Received for inactive RundownPlaylist "${playlist._id}"`)
		} else {
			throw new Error(`PieceInstance "${data.partInstanceId}" in RundownPlaylist "${playlist._id}" not found!`)
		}
		return
	}

	const isPlaying = !!(
		pieceInstance.PieceInstance.reportedStartedPlayback && !pieceInstance.PieceInstance.reportedStoppedPlayback
	)
	if (!isPlaying) {
		logger.debug(
			`onPiecePlaybackStarted: Playout reports pieceInstance "${
				data.pieceInstanceId
			}" has started playback on timestamp ${new Date(data.startedPlayback).toISOString()}`
		)
		reportPieceHasStarted(context, cache, partInstance, pieceInstance, data.startedPlayback)

		// We don't need to bother with an updateTimeline(), as this hasn't changed anything, but lets us accurately add started items when reevaluating
	}
}

/**
 * Set the playback of a piece is confirmed to have stopped
 * @param context Context from the job queue
 * @param cache DB cache for the current playlist
 * @param data Details on the piece stop event
 */
export function onPiecePlaybackStopped(
	context: JobContext,
	cache: PlayoutModel,
	data: {
		partInstanceId: PartInstanceId
		pieceInstanceId: PieceInstanceId
		stoppedPlayback: Time
	}
): void {
	const playlist = cache.Playlist

	const partInstance = cache.getPartInstance(data.partInstanceId)
	if (!partInstance) {
		// PartInstance not found, so we can rely on the onPartPlaybackStopped callback erroring
		return
	}

	const pieceInstance = partInstance.getPieceInstance(data.pieceInstanceId)
	if (!pieceInstance) {
		if (!playlist.activationId) {
			logger.warn(`onPiecePlaybackStopped: Received for inactive RundownPlaylist "${playlist._id}"`)
		} else {
			throw new Error(`PieceInstance "${data.partInstanceId}" in RundownPlaylist "${playlist._id}" not found!`)
		}
		return
	}

	const isPlaying = !!(
		pieceInstance.PieceInstance.reportedStartedPlayback && !pieceInstance.PieceInstance.reportedStoppedPlayback
	)
	if (isPlaying) {
		logger.debug(
			`onPiecePlaybackStopped: Playout reports pieceInstance "${
				data.pieceInstanceId
			}" has stopped playback on timestamp ${new Date(data.stoppedPlayback).toISOString()}`
		)

		reportPieceHasStopped(context, cache, pieceInstance, data.stoppedPlayback)
	}
}

/**
 * Set the playback of a PieceInstance is confirmed to have started
 * @param context Context from the job queue
 * @param cache DB cache for the current playlist
 * @param pieceInstance PieceInstance to be updated
 * @param timestamp timestamp the PieceInstance started
 */
function reportPieceHasStarted(
	_context: JobContext,
	cache: PlayoutModel,
	partInstance: PlayoutPartInstanceModel,
	pieceInstance: PlayoutPieceInstanceModel,
	timestamp: Time
): void {
	const timestampChanged = pieceInstance.setReportedStartedPlayback(timestamp)
	if (timestampChanged) {
		if (!cache.isMultiGatewayMode) {
			pieceInstance.setPlannedStartedPlayback(timestamp)
		}

		// Update the copy in the next-part if there is one, so that the infinite has the same start after a take
		const nextPartInstance = cache.NextPartInstance
		if (
			pieceInstance.PieceInstance.infinite &&
			nextPartInstance &&
			nextPartInstance.PartInstance._id !== partInstance.PartInstance._id
		) {
			const infiniteInstanceId = pieceInstance.PieceInstance.infinite.infiniteInstanceId
			for (const nextPieceInstance of nextPartInstance.PieceInstances) {
				if (
					!!nextPieceInstance.PieceInstance.infinite &&
					nextPieceInstance.PieceInstance.infinite.infiniteInstanceId === infiniteInstanceId
				) {
					nextPieceInstance.setReportedStartedPlayback(timestamp)

					if (!cache.isMultiGatewayMode) {
						nextPieceInstance.setPlannedStartedPlayback(timestamp)
					}
				}
			}
		}

		cache.queuePartInstanceTimingEvent(partInstance.PartInstance._id)
	}
}

/**
 * Set the playback of a PieceInstance is confirmed to have stopped
 * @param context Context from the job queue
 * @param cache DB cache for the current playlist
 * @param pieceInstance PieceInstance to be updated
 * @param timestamp timestamp the PieceInstance stopped
 */
function reportPieceHasStopped(
	_context: JobContext,
	cache: PlayoutModel,
	pieceInstance: PlayoutPieceInstanceModel,
	timestamp: Time
): void {
	const timestampChanged = pieceInstance.setReportedStoppedPlayback(timestamp)

	if (timestampChanged) {
		if (!cache.isMultiGatewayMode) {
			pieceInstance.setPlannedStoppedPlayback(timestamp)
		}

		cache.queuePartInstanceTimingEvent(pieceInstance.PieceInstance.partInstanceId)
	}
}
