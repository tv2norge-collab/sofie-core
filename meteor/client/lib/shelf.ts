import { IOutputLayer, ISourceLayer } from '@sofie-automation/blueprints-integration'
import { AdLibAction } from '../../lib/collections/AdLibActions'
import { AdLibPiece } from '../../lib/collections/AdLibPieces'
import { PartInstance } from '../../lib/collections/PartInstances'
import { PieceInstance, PieceInstances } from '../../lib/collections/PieceInstances'
import { PieceId } from '../../lib/collections/Pieces'
import { RundownBaselineAdLibAction } from '../../lib/collections/RundownBaselineAdLibActions'
import { RundownPlaylist } from '../../lib/collections/RundownPlaylists'
import { DBSegment, SegmentId } from '../../lib/collections/Segments'
import { ShowStyleBase } from '../../lib/collections/ShowStyleBases'
import { ScanInfoForPackages } from '../../lib/mediaObjects'
import { processAndPrunePieceInstanceTimings } from '../../lib/rundown/infinites'
import { getUnfinishedPieceInstancesReactive } from './rundownLayouts'

export interface AdLibPieceUi extends AdLibPiece {
	hotkey?: string
	sourceLayer?: ISourceLayer
	outputLayer?: IOutputLayer
	isGlobal?: boolean
	isHidden?: boolean
	isSticky?: boolean
	isAction?: boolean
	isClearSourceLayer?: boolean
	adlibAction?: AdLibAction | RundownBaselineAdLibAction
	contentMetaData?: any
	contentPackageInfos?: ScanInfoForPackages
	message?: string | null
	segmentId?: SegmentId
}

export interface AdlibSegmentUi extends DBSegment {
	/** Pieces belonging to this part */
	parts: Array<PartInstance>
	pieces: Array<AdLibPieceUi>
	isLive: boolean
	isNext: boolean
}

export function isAdLibOnAir(unfinishedAdLibIds: PieceId[], unfinishedTags: string[], adLib: AdLibPieceUi) {
	if (
		unfinishedAdLibIds.includes(adLib._id) ||
		(adLib.currentPieceTags && adLib.currentPieceTags.every((tag) => unfinishedTags.includes(tag)))
	) {
		return true
	}
	return false
}

export function isAdLibNext(nextAdLibIds: PieceId[], nextTags: string[], adLib: AdLibPieceUi) {
	if (
		nextAdLibIds.includes(adLib._id) ||
		(adLib.nextPieceTags && adLib.nextPieceTags.every((tag) => nextTags.includes(tag)))
	) {
		return true
	}
	return false
}

export function getNextPiecesReactive(showsStyleBase: ShowStyleBase, playlist: RundownPlaylist): PieceInstance[] {
	let prospectivePieceInstances: PieceInstance[] = []
	if (playlist.activationId && playlist.nextPartInstanceId) {
		prospectivePieceInstances = PieceInstances.find({
			playlistActivationId: playlist.activationId,
			partInstanceId: playlist.nextPartInstanceId,
			$and: [
				{
					piece: {
						$exists: true,
					},
				},
				{
					$or: [
						{
							adLibSourceId: {
								$exists: true,
							},
						},
						{
							'piece.tags': {
								$exists: true,
							},
						},
					],
				},
			],
		}).fetch()
	}

	prospectivePieceInstances = processAndPrunePieceInstanceTimings(showsStyleBase, prospectivePieceInstances, 0)

	return prospectivePieceInstances
}

export function getNextPieceInstancesGrouped(
	showStyleBase: ShowStyleBase,
	playlist: RundownPlaylist
): {
	nextAdLibIds: PieceId[]
	nextTags: string[]
	nextPieceInstances: PieceInstance[]
} {
	const nextPieceInstances = getNextPiecesReactive(showStyleBase, playlist)

	const nextAdLibIds: PieceId[] = nextPieceInstances
		.filter((piece) => !!piece.adLibSourceId)
		.map((piece) => piece.adLibSourceId!)
	const nextTags: string[] = nextPieceInstances
		.filter((piece) => !!piece.piece.tags)
		.map((piece) => piece.piece.tags!)
		.reduce((a, b) => a.concat(b), [])

	return { nextAdLibIds, nextTags, nextPieceInstances }
}

export function getUnfinishedPieceInstancesGrouped(playlist: RundownPlaylist): {
	unfinishedPieceInstances: PieceInstance[]
	unfinishedAdLibIds: PieceId[]
	unfinishedTags: string[]
} {
	const unfinishedPieceInstances = getUnfinishedPieceInstancesReactive(playlist, false)

	const unfinishedAdLibIds: PieceId[] = unfinishedPieceInstances
		.filter((piece) => !!piece.adLibSourceId)
		.map((piece) => piece.adLibSourceId!)
	const unfinishedTags: string[] = unfinishedPieceInstances
		.filter((piece) => !!piece.piece.tags)
		.map((piece) => piece.piece.tags!)
		.reduce((a, b) => a.concat(b), [])

	return {
		unfinishedPieceInstances,
		unfinishedAdLibIds,
		unfinishedTags,
	}
}

export function isAdLibDisplayedAsOnAir(unfinishedAdLibIds: PieceId[], unfinishedTags: string[], adLib: AdLibPieceUi) {
	const isOnAir = isAdLibOnAir(unfinishedAdLibIds, unfinishedTags, adLib)
	return adLib.invertOnAirState ? !isOnAir : isOnAir
}