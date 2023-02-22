import * as TSR from 'timeline-state-resolver-types'
export { TSR }

export { Timeline } from 'timeline-state-resolver-types'

export enum TimelineObjClassesCore {
	RundownRehearsal = 'rundown_rehersal',
	RundownActive = 'rundown_active',
	BeforeFirstPart = 'before_first_part',
	NoNextPart = 'last_part',
}

export enum TimelineObjHoldMode {
	NORMAL = 0,
	ONLY = 1, // Only use when in HOLD
	EXCEPT = 2, // Only use when not in HOLD
}

export interface TimelineObjectCoreExt<
	TContent extends { deviceType: TSR.DeviceType },
	TMetadata = unknown,
	TKeyframeMetadata = unknown
> extends TSR.TSRTimelineObj<TContent> {
	/** Restrict object usage according to whether we are currently in a hold */
	holdMode?: TimelineObjHoldMode
	/** Arbitrary data storage for plugins */
	metaData?: TMetadata
	/** Keyframes: Arbitrary data storage for plugins */
	keyframes?: Array<TimelineKeyframeCoreExt<TContent, TKeyframeMetadata>>
}

export interface TimelineKeyframeCoreExt<TContent extends { deviceType: TSR.DeviceType }, TKeyframeMetadata = unknown>
	extends TSR.Timeline.TimelineKeyframe<TContent> {
	metaData?: TKeyframeMetadata
	/** Whether to keep this keyframe when the object is copied for lookahead. By default all keyframes are removed */
	preserveForLookahead?: boolean
}

/** TimelineObject extension for additional fields needed by onTimelineGenerate */
export interface OnGenerateTimelineObj<
	TContent extends { deviceType: TSR.DeviceType },
	TMetadata = unknown,
	TKeyframeMetadata = unknown
> extends TimelineObjectCoreExt<TContent, TMetadata, TKeyframeMetadata> {
	pieceInstanceId?: string
}
