import { TSR, OnGenerateTimelineObj, TimelineObjectCoreExt, Time } from '@sofie-automation/blueprints-integration'
import { SetRequired } from 'type-fest'
import { ProtectedString, protectString, unprotectString } from '../protectedString'
import { PartInstanceId, PieceInstanceInfiniteId, BlueprintId, StudioId } from './Ids'

export enum TimelineContentTypeOther {
	NOTHING = 'nothing',
	GROUP = 'group',
}

import { TimelineHash } from '@sofie-automation/shared-lib/dist/core/model/Ids'
export { TimelineHash }
import {
	PartPlaybackCallbackData,
	PiecePlaybackCallbackData,
	PlayoutChangedType,
} from '@sofie-automation/shared-lib/dist/peripheralDevice/peripheralDeviceAPI'
export { PartPlaybackCallbackData, PiecePlaybackCallbackData }

export type TimelineEnableExt = TSR.Timeline.TimelineEnable & { setFromNow?: boolean }

export interface OnGenerateTimelineObjExt<TMetadata = unknown, TKeyframeMetadata = unknown>
	extends SetRequired<OnGenerateTimelineObj<TSR.TSRTimelineContent, TMetadata, TKeyframeMetadata>, 'metaData'> {
	/** The id of the partInstance this object belongs to */
	partInstanceId: PartInstanceId | null
	/** If this is from an infinite piece, the id of the infinite instance */
	infinitePieceInstanceId?: PieceInstanceInfiniteId
}

export interface TimelineObjGeneric extends TimelineObjectCoreExt<TSR.TSRTimelineContent> {
	/** Unique within a timeline (ie within a studio) */
	id: string
	/** Set when the id of the object is prefixed */
	originalId?: string

	objectType: TimelineObjType

	enable: TimelineEnableExt | TimelineEnableExt[]

	/** The id of the group object this object is in  */
	inGroup?: string
}

export enum TimelineObjType {
	/** Objects played in a rundown */
	RUNDOWN = 'rundown',
}
export interface TimelineObjRundown extends TimelineObjGeneric {
	objectType: TimelineObjType.RUNDOWN
}
export interface TimelineObjGroup extends Omit<TimelineObjGeneric, 'content'> {
	enable: TimelineEnableExt
	content: {
		type: TimelineContentTypeOther.GROUP
	}
	children: TimelineObjGeneric[]
	isGroup: true
}
export type TimelineObjGroupRundown = TimelineObjGroup & Omit<TimelineObjRundown, 'enable'>

export type TimelineObjGroupPart = TimelineObjGroupRundown

export interface TimelineObjPartAbstract extends TimelineObjRundown {
	// used for sending callbacks
	content: {
		deviceType: TSR.DeviceType.ABSTRACT
		type: 'callback'
		callBack: PlayoutChangedType.PART_PLAYBACK_STARTED
		callBackStopped: PlayoutChangedType.PART_PLAYBACK_STOPPED
		callBackData: PartPlaybackCallbackData
	}
}
export interface TimelineObjPieceAbstract extends Omit<TimelineObjRundown, 'enable'> {
	enable: TimelineEnableExt

	// used for sending callbacks
	content: {
		deviceType: TSR.DeviceType.ABSTRACT
		type: 'callback'
		callBack: PlayoutChangedType.PIECE_PLAYBACK_STARTED
		callBackStopped: PlayoutChangedType.PIECE_PLAYBACK_STOPPED
		callBackData: PiecePlaybackCallbackData
	}
}

export function updateLookaheadLayer(obj: TimelineObjRundown): void {
	// Set lookaheadForLayer to reference the original layer:
	obj.lookaheadForLayer = obj.layer
	obj.layer += '_lookahead'
}

/** Version numbers of sofie at the time the timeline was generated */
export interface TimelineCompleteGenerationVersions {
	core: string
	blueprintId: BlueprintId | undefined
	blueprintVersion: string
	studio: string
}

export interface TimelineComplete {
	/** The id of the timeline. Since there is one (1) timeline in a studio, we can use that id here. */
	_id: StudioId
	/**
	 * The TimelineHash is a random string, which is modified whenever the timeline has changed.
	 * It is used in the playout-gateway to be able to report back resolve-times
	 */
	timelineHash: TimelineHash
	/** Timestamp when the timeline is generated */
	generated: Time
	/** serialized JSON Array containing all timeline-objects.  */
	timelineBlob: TimelineBlob
	/** Version numbers of sofie at the time the timeline was generated */
	generationVersions: TimelineCompleteGenerationVersions
}

export type TimelineBlob = ProtectedString<'TimelineBlob'>

export function deserializeTimelineBlob(timelineBlob: TimelineBlob): TimelineObjGeneric[] {
	return JSON.parse(unprotectString(timelineBlob)) as Array<TimelineObjGeneric>
}
export function serializeTimelineBlob(timeline: TimelineObjGeneric[]): TimelineBlob {
	return protectString(JSON.stringify(timeline))
}
