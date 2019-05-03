import { syncFunctionIgnore } from '../../codeControl'
import {
	Time,
	getPartGroupId,
	getPartFirstObjectId,
	TimelineObjectCoreExt,
	getPieceGroupId,
	TimelineObjHoldMode
} from 'tv-automation-sofie-blueprints-integration'
import { logger } from '../../../lib/logging'
import {
	TimelineObjGeneric,
	Timeline,
	TimelineObjRundown,
	TimelineObjStat,
	TimelineObjType,
	TimelineContentTypeOther,
	TimelineObjRecording,
	TimelineObjGroup,
	TimelineObjGroupPart,
	TimelineObjPartAbstract,
	getTimelineId,
	fixTimelineId
} from '../../../lib/collections/Timeline'
import { Studios,
	Studio } from '../../../lib/collections/Studios'
import { Meteor } from 'meteor/meteor'
import {
	waitForPromiseAll,
	caught,
	makePromise,
	saveIntoDb,
	asyncCollectionFindOne,
	waitForPromise,
	asyncCollectionRemove,
	asyncCollectionFindFetch,
	getHash,
	stringifyObjects,
	getCurrentTime,
	asyncCollectionUpsert,
	extendMandadory,
	literal,
	omit
} from '../../../lib/lib'
import { Rundowns, RundownData, Rundown, RundownHoldState } from '../../../lib/collections/Rundowns'
import { RundownBaselineItem, RundownBaselineObjs } from '../../../lib/collections/RundownBaselineObjs'
import {
	TimelineContentTypeLawo,
	TimelineObjLawo,
	TimelineContentTypeHttp,
	TimelineObjHTTPRequest,
	Timeline as TimelineTypes
} from 'timeline-state-resolver-types'
import * as _ from 'underscore'
import { TriggerType } from 'superfly-timeline'
import { getLookeaheadObjects } from './lookahead'
import { loadStudioBlueprints, loadShowStyleBlueprints, getBlueprintOfRundown } from '../blueprints/cache'
import { StudioContext, RundownContext } from '../blueprints/context'
import { postProcessStudioBaselineObjects } from '../blueprints/postProcess'
import { RecordedFiles } from '../../../lib/collections/RecordedFiles'
import { generateRecordingTimelineObjs } from '../testTools'
import { Part } from '../../../lib/collections/Parts'
import { Piece } from '../../../lib/collections/Pieces'
import { prefixAllObjectIds } from './lib'
import { createPieceGroup, createPieceGroupFirstObject } from './pieces'
import { PackageInfo } from '../../coreSystem'
let clone = require('fast-clone')

/**
 * Updates the Timeline to reflect the state in the Rundown, Segments, Parts etc...
 * @param studioId id of the studio to update
 * @param forceNowToTime if set, instantly forces all "now"-objects to that time (used in autoNext)
 */
export const updateTimeline: (studioId: string, forceNowToTime?: Time) => void
= syncFunctionIgnore(function updateTimeline (studioId: string, forceNowToTime?: Time) {
	logger.debug('updateTimeline running...')
	let timelineObjs: Array<TimelineObjGeneric> = []

	let studio = Studios.findOne(studioId) as Studio
	if (!studio) throw new Meteor.Error(404, 'studio "' + studioId + '" not found!')

	const applyTimelineObjs = (_timelineObjs: TimelineObjGeneric[]) => {
		timelineObjs = timelineObjs.concat(_timelineObjs)
	}

	waitForPromiseAll([
		caught(getTimelineRundown(studio).then(applyTimelineObjs)),
		caught(getTimelineRecording(studio).then(applyTimelineObjs))
	])

	processTimelineObjects(studio, timelineObjs)

	if (forceNowToTime) { // used when autoNexting
		setNowToTimeInObjects(timelineObjs, forceNowToTime)
	}

	const ps: Promise<any>[] = []

	ps.push(makePromise(() => {
		saveIntoDb<TimelineObjGeneric, TimelineObjGeneric>(Timeline, {
			studioId: studio._id,
			statObject: { $ne: true }
		}, timelineObjs, {
			beforeUpdate: (o: TimelineObjGeneric, oldO: TimelineObjGeneric): TimelineObjGeneric => {
				// do not overwrite trigger when the trigger has been denowified
				if (o.trigger.value === 'now' && oldO.trigger.setFromNow) {
					o.trigger.type = oldO.trigger.type
					o.trigger.value = oldO.trigger.value
				}
				return o
			}
		})
	}))

	ps.push(makePromise(() => {
		afterUpdateTimeline(studio, timelineObjs)
	}))
	waitForPromiseAll(ps)

	logger.debug('updateTimeline done!')
})
/**
 * To be called after an update to the timeline has been made, will add/update the "statObj" - an object
 * containing the hash of the timeline, used to determine if the timeline should be updated in the gateways
 * @param studioId id of the studio to update
 */
export function afterUpdateTimeline (studio: Studio, timelineObjs?: Array<TimelineObjGeneric>) {

	// logger.info('afterUpdateTimeline')
	if (!timelineObjs) {
		timelineObjs = Timeline.find({
			studioId: studio._id,
			statObject: { $ne: true }
		}).fetch()
	}

	// Number of objects
	let objCount = timelineObjs.length
	// Hash of all objects
	timelineObjs = timelineObjs.sort((a, b) => {
		if (a._id < b._id) return 1
		if (a._id > b._id) return -1
		return 0
	})
	let objHash = getHash(stringifyObjects(timelineObjs))

	// save into "magic object":
	let statObj: TimelineObjStat = {
		id: 'statObj',
		_id: '', // set later
		studioId: studio._id,
		objectType: TimelineObjType.STAT,
		statObject: true,
		content: {
			type: TimelineContentTypeOther.NOTHING,
			modified: getCurrentTime(),
			objCount: objCount,
			objHash: objHash
		},
		trigger: {
			type: TriggerType.TIME_ABSOLUTE,
			value: 0 // never
		},
		duration: 0,
		isAbstract: true,
		LLayer: '__stat'
	}
	statObj._id = getTimelineId(statObj)

	waitForPromise(asyncCollectionUpsert(Timeline, statObj._id, { $set: statObj }))
}
/**
 * Returns timeline objects related to rundowns in a studio
 */
function getTimelineRundown (studio: Studio): Promise<TimelineObjRundown[]> {

	return new Promise((resolve, reject) => {
		try {
			let timelineObjs: Array<TimelineObjGeneric> = []

			const promiseActiveRundown = asyncCollectionFindOne(Rundowns, {
				studioId: studio._id,
				active: true
			})
			// let promiseStudio = asyncCollectionFindOne(Studios, studio._id)
			let activeRundown = waitForPromise(promiseActiveRundown)

			if (activeRundown) {

				// remove anything not related to active rundown:
				let promiseClearTimeline: Promise<void> = asyncCollectionRemove(Timeline, {
					studioId: studio._id,
					rundownId: {
						$not: {
							$eq: activeRundown._id
						}
					}
				})
				// Start with fetching stuff from database:
				let promiseBaselineItems: Promise<Array<RundownBaselineItem>> = asyncCollectionFindFetch(RundownBaselineObjs, {
					rundownId: activeRundown._id
				})
				let rundownData: RundownData = activeRundown.fetchAllData()

				// Default timelineobjects:
				let baselineItems = waitForPromise(promiseBaselineItems)

				timelineObjs = timelineObjs.concat(buildTimelineObjsForRundown(rundownData, baselineItems))

				// next (on pvw (or on pgm if first))
				timelineObjs = timelineObjs.concat(getLookeaheadObjects(rundownData, studio))

				const showStyleBlueprint = getBlueprintOfRundown(activeRundown).blueprint
				if (showStyleBlueprint.onTimelineGenerate) {

					const context = new RundownContext(activeRundown, studio)
					timelineObjs = _.map(waitForPromise(showStyleBlueprint.onTimelineGenerate(context, timelineObjs)), (object: TimelineTypes.TimelineObject) => {
						return literal<TimelineObjGeneric>({
							...object,
							_id: '', // set later
							objectType: TimelineObjType.RUNDOWN,
							studioId: studio._id
						})
					})
				}

				// TODO: Specific implementations, to be refactored into Blueprints:
				setLawoObjectsTriggerValue(timelineObjs, activeRundown.currentPartId || undefined)
				timelineObjs = validateNoraPreload(timelineObjs)

				waitForPromise(promiseClearTimeline)

				resolve(
					_.map<TimelineObjGeneric, TimelineObjRundown>(timelineObjs, (timelineObj) => {

						return extendMandadory<TimelineObjGeneric, TimelineObjRundown>(timelineObj, {
							rundownId: activeRundown._id,
							objectType: TimelineObjType.RUNDOWN
						})
					})
				)
			} else {
				let studioBaseline: TimelineObjRundown[] = []

				const studioBlueprint = loadStudioBlueprints(studio)
				if (studioBlueprint) {
					const blueprint = studioBlueprint.blueprint
					const baselineObjs = blueprint.getBaseline(new StudioContext(studio))
					studioBaseline = postProcessStudioBaselineObjects(studio, baselineObjs)

					const id = `baseline_version`
					studioBaseline.push(literal<TimelineObjRundown>({
						id: id,
						_id: '', // set later
						studioId: '', // set later
						rundownId: '',
						objectType: TimelineObjType.RUNDOWN,
						trigger: { type: 0, value: 0 },
						duration: 0,
						LLayer: id,
						isAbstract: true,
						content: {
							versions: {
								core: PackageInfo.version,
								blueprintId: studio.blueprintId,
								blueprintVersion: blueprint.blueprintVersion,
								studio: studio._rundownVersionHash,
							}
						}
					}))
				}

				resolve(studioBaseline)
			}
		} catch (e) {
			reject(e)
		}
	})

}
/**
 * Returns timeline objects related to Test Recordings in a studio
 */
function getTimelineRecording (studio: Studio, forceNowToTime?: Time): Promise<TimelineObjRecording[]> {

	return new Promise((resolve, reject) => {
		try {
			let recordingTimelineObjs: TimelineObjRecording[] = []

			RecordedFiles.find({ // TODO: ask Julian if this is okay, having multiple recordings at the same time?
				studioId: studio._id,
				stoppedAt: { $exists: false }
			}, {
				sort: {
					startedAt: 1 // TODO - is order correct?
				}
			}).forEach((activeRecording) => {
				recordingTimelineObjs = recordingTimelineObjs.concat(
					generateRecordingTimelineObjs(studio, activeRecording)
				)
			})

			resolve(recordingTimelineObjs)
		} catch (e) {
			reject(e)
		}
	})
	// Timeline.remove({
	// 	siId: studioId,
	// 	recordingObject: true
	// })
}
/**
 * Fix the timeline objects, adds properties like deviceId and studioId to the timeline objects
 * @param studio
 * @param timelineObjs Array of timeline objects
 */
function processTimelineObjects (studio: Studio, timelineObjs: Array<TimelineObjGeneric>): void {
	// first, split out any grouped objects, to make the timeline shallow:
	let fixObjectChildren = (o: TimelineObjGeneric): void => {
		// Unravel children objects and put them on the (flat) timelineObjs array
		if (o.isGroup && o.content && o.content.objects && o.content.objects.length) {

			_.each(o.content.objects, (child: TimelineTypes.TimelineObject) => {

				let childFixed: TimelineObjGeneric = {
					...child,
					_id: '', // set later
					studioId: o.studioId,
					objectType: o.objectType,
					inGroup: o._id
				}
				if (!childFixed.id) logger.error(`TimelineObj missing id attribute (child of ${o._id})`, childFixed)
				childFixed._id = getTimelineId(childFixed)
				timelineObjs.push(childFixed)

				fixObjectChildren(childFixed)
			})
			delete o.content.objects
		}
	}
	_.each(timelineObjs, (o: TimelineObjGeneric) => {
		o.studioId = studio._id
		o._id = getTimelineId(o)
		fixObjectChildren(o)
	})
}
/**
 * goes through timelineObjs and forces the "now"-values to the absolute time specified
 * @param timelineObjs Array of (flat) timeline objects
 * @param now The time to set the "now":s to
 */
function setNowToTimeInObjects (timelineObjs: Array<TimelineObjGeneric>, now: Time): void {
	_.each(timelineObjs, (o) => {
		if (o.trigger.type === TriggerType.TIME_ABSOLUTE &&
			o.trigger.value === 'now'
		) {
			o.trigger.value = now
			o.trigger.setFromNow = true
		}
	})
}

function buildTimelineObjsForRundown (rundownData: RundownData, baselineItems: RundownBaselineItem[]): TimelineObjRundown[] {
	let timelineObjs: Array<TimelineObjRundown> = []
	let currentPartGroup: TimelineObjRundown | undefined
	let previousPartGroup: TimelineObjRundown | undefined

	let currentPart: Part | undefined
	let nextPart: Part | undefined

	// let currentPieces: Array<Piece> = []
	let previousPart: Part | undefined

	let activeRundown = rundownData.rundown

	timelineObjs.push(literal<TimelineObjRundown>({
		id: activeRundown._id + '_status',
		_id: '', // set later
		studioId: '', // set later
		objectType: TimelineObjType.RUNDOWN,
		rundownId: rundownData.rundown._id,
		trigger: {
			type: TriggerType.LOGICAL,
			value: '1'
		},
		LLayer: 'rundown_status',
		isAbstract: true,
		content: {},
		classes: [activeRundown.rehearsal ? 'rundown_rehersal' : 'rundown_active']
	}))

	// Fetch the nextPart first, because that affects how the currentPart will be treated
	if (activeRundown.nextPartId) {
		// We may be at the beginning of a show, and there can be no currentPart and we are waiting for the user to Take
		nextPart = rundownData.partsMap[activeRundown.nextPartId]
		if (!nextPart) throw new Meteor.Error(404, `Part "${activeRundown.nextPartId}" not found!`)
	}

	if (activeRundown.currentPartId) {
		currentPart = rundownData.partsMap[activeRundown.currentPartId]
		if (!currentPart) throw new Meteor.Error(404, `Part "${activeRundown.currentPartId}" not found!`)

		if (activeRundown.previousPartId) {
			previousPart = rundownData.partsMap[activeRundown.previousPartId]
			if (!previousPart) throw new Meteor.Error(404, `Part "${activeRundown.previousPartId}" not found!`)
		}
	}

	if (baselineItems) {
		timelineObjs = timelineObjs.concat(transformBaselineItemsIntoTimeline(rundownData.rundown, baselineItems))
	}

	// Currently playing:
	if (currentPart) {

		const currentPieces = currentPart.getAllPieces()
		const currentInfiniteItems = currentPieces.filter(l => (l.infiniteMode && l.infiniteId && l.infiniteId !== l._id))
		const currentNormalItems = currentPieces.filter(l => !(l.infiniteMode && l.infiniteId && l.infiniteId !== l._id))

		let allowTransition = false

		if (previousPart) {
			allowTransition = !previousPart.disableOutTransition

			if (previousPart.getLastStartedPlayback()) {
				const prevSlOverlapDuration = calcSlKeepaliveDuration(previousPart, currentPart, true)
				previousPartGroup = createPartGroup(previousPart, `#${getPartGroupId(currentPart)}.start + ${prevSlOverlapDuration} - #.start`)
				previousPartGroup.priority = -1
				previousPartGroup.trigger = literal<TimelineTypes.TimelineTrigger>({
					type: TriggerType.TIME_ABSOLUTE,
					value: previousPart.getLastStartedPlayback() || 0
				})

				// If a Piece is infinite, and continued in the new Part, then we want to add the Piece only there to avoid id collisions
				const skipIds = currentInfiniteItems.map(l => l.infiniteId || '')
				const previousPieces = previousPart.getAllPieces().filter(l => !l.infiniteId || skipIds.indexOf(l.infiniteId) < 0)

				const groupClasses: string[] = ['previous_part']
				let prevObjs: TimelineObjRundown[] = [previousPartGroup]
				prevObjs = prevObjs.concat(
					transformPartIntoTimeline(rundownData.rundown, previousPieces, groupClasses, previousPartGroup, undefined, activeRundown.holdState, undefined))

				prevObjs = prefixAllObjectIds(prevObjs, 'previous_')

				// If autonext with an overlap, keep the previous line alive for the specified overlap
				if (previousPart.autoNext && previousPart.autoNextOverlap) {
					previousPartGroup.duration = `#${getPartGroupId(currentPart)}.start + ${previousPart.autoNextOverlap || 0} - #.start`
				}

				timelineObjs = timelineObjs.concat(prevObjs)
			}
		}

		// fetch items
		// fetch the timelineobjs in items
		const isFollowed = nextPart && currentPart.autoNext
		const currentSLDuration = !isFollowed ? 0 : calcSlTargetDuration(previousPart, currentPart)
		currentPartGroup = createPartGroup(currentPart, currentSLDuration)
		if (currentPart.startedPlayback && currentPart.getLastStartedPlayback()) { // If we are recalculating the currentLine, then ensure it doesnt think it is starting now
			currentPartGroup.trigger = literal<TimelineTypes.TimelineTrigger>({
				type: TriggerType.TIME_ABSOLUTE,
				value: currentPart.getLastStartedPlayback() || 0
			})
		}

		// any continued infinite lines need to skip the group, as they need a different start trigger
		for (let item of currentInfiniteItems) {
			const infiniteGroup = createPartGroup(currentPart, item.expectedDuration || 0)
			infiniteGroup.id = getPartGroupId(item._id) + '_infinite'
			infiniteGroup.priority = 1

			const groupClasses: string[] = ['current_part']
			// If the previousPart also contains another segment of this infinite piece, then we label our new one as such
			if (previousPart && previousPart.getAllPieces().filter(i => i.infiniteId && i.infiniteId === item.infiniteId)) {
				groupClasses.push('continues_infinite')
			}

			if (item.infiniteId) {
				const originalItem = _.find(rundownData.pieces, (piece => piece._id === item.infiniteId))

				// If we are a continuation, set the same start point to ensure that anything timed is correct
				if (originalItem && originalItem.startedPlayback) {
					infiniteGroup.trigger = literal<TimelineTypes.TimelineTrigger>({
						type: TriggerType.TIME_ABSOLUTE,
						value: originalItem.startedPlayback
					})

					// If an absolute time has been set by a hotkey, then update the duration to be correct
					const partStartedPlayback = currentPart.getLastStartedPlayback()
					if (item.durationOverride && partStartedPlayback) {
						const originalEndTime = partStartedPlayback + item.durationOverride
						infiniteGroup.duration = originalEndTime - originalItem.startedPlayback
					}
				}
			}

			// Still show objects flagged as 'HoldMode.EXCEPT' if this is a infinite continuation as they belong to the previous too
			const showHoldExcept = item.infiniteId !== item._id
			timelineObjs = timelineObjs.concat(infiniteGroup, transformPartIntoTimeline(rundownData.rundown, [item], groupClasses, infiniteGroup, undefined, activeRundown.holdState, showHoldExcept))
		}

		const groupClasses: string[] = ['current_part']
		const transProps: TransformTransitionProps = {
			allowed: allowTransition,
			preroll: currentPart.prerollDuration,
			transitionPreroll: currentPart.transitionPrerollDuration,
			transitionKeepalive: currentPart.transitionKeepaliveDuration
		}
		timelineObjs = timelineObjs.concat(
			currentPartGroup,
			transformPartIntoTimeline(rundownData.rundown, currentNormalItems, groupClasses, currentPartGroup, transProps, activeRundown.holdState, undefined)
		)

		timelineObjs.push(createPartGroupFirstObject(currentPart, currentPartGroup, previousPart))

		// only add the next objects into the timeline if the next segment is autoNext
		if (nextPart && currentPart.autoNext) {
			// console.log('This part will autonext')
			let nextPieceGroup = createPartGroup(nextPart, 0)
			if (currentPartGroup) {
				const overlapDuration = calcSlOverlapDuration(currentPart, nextPart)

				nextPieceGroup.trigger = literal<TimelineTypes.TimelineTrigger>({
					type: TriggerType.TIME_RELATIVE,
					value: `#${currentPartGroup.id}.end - ${overlapDuration}`
				})
				if (typeof currentPartGroup.duration === 'number') {
					currentPartGroup.duration += currentPart.autoNextOverlap || 0
				}
			}

			let toSkipIds = currentPieces.filter(i => i.infiniteId).map(i => i.infiniteId)

			let nextItems = nextPart.getAllPieces()
			nextItems = nextItems.filter(i => !i.infiniteId || toSkipIds.indexOf(i.infiniteId) === -1)

			const groupClasses: string[] = ['next_part']
			const transProps: TransformTransitionProps = {
				allowed: currentPart && !currentPart.disableOutTransition,
				preroll: nextPart.prerollDuration,
				transitionPreroll: nextPart.transitionPrerollDuration,
				transitionKeepalive: nextPart.transitionKeepaliveDuration
			}
			timelineObjs = timelineObjs.concat(
				nextPieceGroup,
				transformPartIntoTimeline(rundownData.rundown, nextItems, groupClasses, nextPieceGroup, transProps)
			)
			timelineObjs.push(createPartGroupFirstObject(nextPart, nextPieceGroup, currentPart))
		}
	}

	if (!nextPart && !currentPart) {
		// maybe at the end of the show
		logger.info(`No next part and no current part set on rundown "${activeRundown._id}".`)
	}

	return timelineObjs
}
function createPartGroup (part: Part, duration: number | string): TimelineObjGroupPart & TimelineObjRundown {
	let partGrp = literal<TimelineObjGroupPart & TimelineObjRundown>({
		id: getPartGroupId(part),
		_id: '', // set later
		studioId: '', // set later
		rundownId: part.rundownId,
		objectType: TimelineObjType.RUNDOWN,
		trigger: {
			type: TriggerType.TIME_ABSOLUTE,
			value: 'now'
		},
		duration: duration,
		priority: 5,
		LLayer: 'core_abstract',
		content: {
			type: TimelineContentTypeOther.GROUP,
			objects: []
		},
		isGroup: true,
		isPartGroup: true,
		// partId: part._id
	})

	return partGrp
}
function createPartGroupFirstObject (
	part: Part,
	partGroup: TimelineObjRundown,
	previousPart?: Part
): TimelineObjPartAbstract {
	return literal<TimelineObjPartAbstract>({
		id: getPartFirstObjectId(part),
		_id: '', // set later
		studioId: '', // set later
		rundownId: part.rundownId,
		objectType: TimelineObjType.RUNDOWN,
		trigger: {
			type: TriggerType.TIME_ABSOLUTE,
			value: 0
		},
		duration: 0,
		LLayer: 'core_abstract',
		isAbstract: true,
		content: {
			type: TimelineContentTypeOther.NOTHING,
		},
		// isGroup: true,
		inGroup: partGroup._id,
		partId: part._id,
		classes: (part.classes || []).concat(previousPart ? previousPart.classesForNext || [] : [])
	})
}

// TODO: Move this functionality to a blueprint?
function setLawoObjectsTriggerValue (timelineObjs: Array<TimelineObjGeneric>, currentPartId: string | undefined) {

	_.each(timelineObjs, (obj) => {
		if (obj.content.type === TimelineContentTypeLawo.SOURCE) {
			let lawoObj = obj as TimelineObjLawo & TimelineObjGeneric

			_.each(lawoObj.content.attributes, (val, key) => {
				// set triggerValue to the current playing segment, thus triggering commands to be sent when nexting:
				lawoObj.content.attributes[key].triggerValue = currentPartId || ''
			})
		}
	})
}

function validateNoraPreload (timelineObjs: Array<TimelineObjGeneric>) {
	const toRemoveIds: Array<string> = []
	_.each(timelineObjs, obj => {
		// ignore normal objects
		if (obj.content.type !== TimelineContentTypeHttp.POST) return
		if (!obj.isBackground) return

		const obj2 = obj as TimelineObjHTTPRequest & TimelineObjGeneric
		if (obj2.content.params && obj2.content.params.template && (obj2.content.params.template).event === 'take') {
			(obj2.content.params.template).event = 'cue'
		} else {
			// something we don't understand, so dont lookahead on it
			toRemoveIds.push(obj._id)
		}
	})

	return timelineObjs.filter(o => toRemoveIds.indexOf(o._id) === -1)
}
function transformBaselineItemsIntoTimeline (rundown: Rundown, items: RundownBaselineItem[]): Array<TimelineObjRundown> {
	let timelineObjs: Array<TimelineObjRundown> = []
	_.each(items, (item: RundownBaselineItem) => {
		// the baseline items are layed out without any grouping
		_.each(item.objects, (o: TimelineObjGeneric) => {
			fixTimelineId(o)
			timelineObjs.push(extendMandadory<TimelineObjGeneric, TimelineObjRundown>(o, {
				rundownId: rundown._id,
				objectType: TimelineObjType.RUNDOWN
			}))
		})
	})
	return timelineObjs
}

interface TransformTransitionProps {
	allowed: boolean
	preroll?: number
	transitionPreroll?: number | null
	transitionKeepalive?: number | null
}

function transformPartIntoTimeline (
	rundown: Rundown,
	items: Piece[],
	firstObjClasses: string[],
	partGroup?: TimelineObjRundown,
	transitionProps?: TransformTransitionProps,
	holdState?: RundownHoldState,
	showHoldExcept?: boolean
): Array<TimelineObjRundown> {
	let timelineObjs: Array<TimelineObjRundown> = []

	const isHold = holdState === RundownHoldState.ACTIVE
	const allowTransition = transitionProps && transitionProps.allowed && !isHold && holdState !== RundownHoldState.COMPLETE
	const transition: Piece | undefined = allowTransition ? clone(items.find(i => !!i.isTransition)) : undefined
	const transitionPieceDelay = transitionProps ? Math.max(0, (transitionProps.preroll || 0) - (transitionProps.transitionPreroll || 0)) : 0
	const transitionContentsDelay = transitionProps ? (transitionProps.transitionPreroll || 0) - (transitionProps.preroll || 0) : 0

	_.each(clone(items), (item: Piece) => {
		if (item.disabled) return
		if (item.isTransition && (!allowTransition || isHold)) {
			return
		}

		if (item.infiniteId && item.infiniteId !== item._id) {
			item._id = item.infiniteId
		}

		if (
			item.content &&
			item.content.timelineObjects
		) {
			let tos: TimelineObjectCoreExt[] = item.content.timelineObjects

			const isInfiniteContinuation = item.infiniteId && item.infiniteId !== item._id
			if (item.trigger.type === TriggerType.TIME_ABSOLUTE && item.trigger.value === 0 && !isInfiniteContinuation) {
				// If timed absolute and there is a transition delay, then apply delay
				if (!item.isTransition && allowTransition && transition && !item.adLibSourceId) {
					const transitionContentsDelayStr = transitionContentsDelay < 0 ? `- ${-transitionContentsDelay}` : `+ ${transitionContentsDelay}`
					item.trigger.type = TriggerType.TIME_RELATIVE
					item.trigger.value = `#${getPieceGroupId(transition)}.start ${transitionContentsDelayStr}`
				} else if (item.isTransition && transitionPieceDelay) {
					item.trigger.type = TriggerType.TIME_ABSOLUTE
					item.trigger.value = Math.max(0, transitionPieceDelay)
				}
			}

			// create a piece group for the items and then place all of them there
			const pieceGroup = createPieceGroup(item, item.durationOverride || item.duration || item.expectedDuration || 0, partGroup)
			timelineObjs.push(pieceGroup)

			if (!item.virtual) {
				timelineObjs.push(createPieceGroupFirstObject(item, pieceGroup, firstObjClasses))

				_.each(tos, (o: TimelineObjectCoreExt) => {
					fixTimelineId(o)
					if (o.holdMode) {
						if (isHold && !showHoldExcept && o.holdMode === TimelineObjHoldMode.EXCEPT) {
							return
						}
						if (!isHold && o.holdMode === TimelineObjHoldMode.ONLY) {
							return
						}
					}
					// if (partGroup) {
						// If we are leaving a HOLD, the transition was suppressed, so force it to run now
						// if (item.isTransition && holdState === RundownHoldState.COMPLETE) {
						// 	o.trigger.value = TriggerType.TIME_ABSOLUTE
						// 	o.trigger.value = 'now'
						// }
					// }

					timelineObjs.push({
						...o,
						_id: '', // set later
						studioId: '', // set later
						inGroup: partGroup ? pieceGroup._id : undefined,
						rundownId: rundown._id,
						objectType: TimelineObjType.RUNDOWN
					})
				})
			}
		}
	})
	return timelineObjs
}

function calcSlKeepaliveDuration (fromSl: Part, toSl: Part, relativeToFrom: boolean): number {
	const allowTransition: boolean = !fromSl.disableOutTransition
	if (!allowTransition) {
		return fromSl.autoNextOverlap || 0
	}

	if (relativeToFrom) { // TODO remove
		if (toSl.transitionKeepaliveDuration === undefined || toSl.transitionKeepaliveDuration === null) {
			return (toSl.prerollDuration || 0)
		}

		const transPieceDelay = Math.max(0, (toSl.prerollDuration || 0) - (toSl.transitionPrerollDuration || 0))
		return transPieceDelay + (toSl.transitionKeepaliveDuration || 0)
	}

	// if (toSl.transitionKeepaliveDuration === undefined || toSl.transitionKeepaliveDuration === null) {
	// 	return (fromSl.autoNextOverlap || 0)
	// }

	return 0
}
function calcSlTargetDuration (prevSl: Part | undefined, currentSl: Part): number {
	if (currentSl.expectedDuration === undefined) {
		return 0
	}

	// This is a horrible hack, to compensate for the expectedDuration mangling in the blueprints which is
	// needed to get the show runtime to be correct. This just inverts that mangling before running as 'intended'
	const maxPreroll = Math.max(currentSl.transitionPrerollDuration ? currentSl.transitionPrerollDuration : 0, currentSl.prerollDuration || 0)
	const maxKeepalive = Math.max(currentSl.transitionKeepaliveDuration ? currentSl.transitionKeepaliveDuration : 0, currentSl.prerollDuration || 0)
	const lengthAdjustment = maxPreroll - maxKeepalive
	const rawExpectedDuration = (currentSl.expectedDuration || 0) - lengthAdjustment

	if (!prevSl || prevSl.disableOutTransition) {
		return rawExpectedDuration + (currentSl.prerollDuration || 0)
	}

	let prerollDuration = (currentSl.transitionPrerollDuration || currentSl.prerollDuration || 0)
	return rawExpectedDuration + (prevSl.autoNextOverlap || 0) + prerollDuration
}
function calcSlOverlapDuration (fromSl: Part, toSl: Part): number {
	const allowTransition: boolean = !fromSl.disableOutTransition
	let overlapDuration: number = toSl.prerollDuration || 0
	if (allowTransition && toSl.transitionPrerollDuration) {
		overlapDuration = calcSlKeepaliveDuration(fromSl, toSl, true)
	}

	if (fromSl.autoNext) {
		overlapDuration += (fromSl.autoNextOverlap || 0)
	}

	return overlapDuration
}
