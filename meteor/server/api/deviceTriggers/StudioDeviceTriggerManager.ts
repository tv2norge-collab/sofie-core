import { Meteor } from 'meteor/meteor'
import { ShowStyleBaseId, StudioId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import { Complete, literal } from '@sofie-automation/corelib/dist/lib'
import { applyAndValidateOverrides } from '@sofie-automation/corelib/dist/settings/objectWithOverrides'
import { ReadonlyObjectDeep } from 'type-fest/source/readonly-deep'
import {
	createAction,
	ExecutableAction,
	isPreviewableAction,
	ReactivePlaylistActionContext,
} from '../../../lib/api/triggers/actionFactory'
import {
	DeviceActionId,
	DeviceTriggerMountedActionId,
	PreviewWrappedAdLib,
	PreviewWrappedAdLibId,
	ShiftRegisterActionArguments,
} from '../../../lib/api/triggers/MountedTriggers'
import { isDeviceTrigger } from '../../../lib/api/triggers/triggerTypeSelectors'
import { DBTriggeredActions, UITriggeredActionsObj } from '../../../lib/collections/TriggeredActions'
import { DummyReactiveVar, protectString } from '../../../lib/lib'
import { StudioActionManager, StudioActionManagers } from './StudioActionManagers'
import { DeviceTriggerMountedActionAdlibsPreview, DeviceTriggerMountedActions } from './observer'
import { ContentCache } from './reactiveContentCache'
import { ContentCache as PieceInstancesContentCache } from './reactiveContentCacheForPieceInstances'
import { logger } from '../../logging'
import { SomeAction, SomeBlueprintTrigger } from '@sofie-automation/blueprints-integration'
import { DeviceActions } from '@sofie-automation/shared-lib/dist/core/model/ShowStyle'

import { TagsService } from './TagsService'

export class StudioDeviceTriggerManager {
	#lastShowStyleBaseId: ShowStyleBaseId | null = null

	lastCache: ContentCache | undefined

	constructor(public studioId: StudioId, protected tagsService: TagsService) {
		if (StudioActionManagers.get(studioId)) {
			logger.error(`A StudioActionManager for "${studioId}" already exists`)
			return
		}

		StudioActionManagers.set(studioId, new StudioActionManager())
	}

	updateTriggers(cache: ContentCache, showStyleBaseId: ShowStyleBaseId): void {
		const studioId = this.studioId
		this.lastCache = cache
		this.#lastShowStyleBaseId = showStyleBaseId

		const rundownPlaylist = cache.RundownPlaylists.findOne({
			activationId: {
				$exists: true,
			},
		})
		if (!rundownPlaylist) {
			return
		}

		const context = createCurrentContextFromCache(cache)
		const actionManager = StudioActionManagers.get(studioId)
		if (!actionManager)
			throw new Meteor.Error(
				500,
				`No Studio Action Manager available to handle action context in Studio "${studioId}"`
			)
		actionManager.setContext(context)

		const showStyleBase = cache.ShowStyleBases.findOne(showStyleBaseId)
		if (!showStyleBase) {
			return
		}

		const { obj: sourceLayers } = applyAndValidateOverrides(showStyleBase.sourceLayersWithOverrides)

		const allTriggeredActions = cache.TriggeredActions.find({
			showStyleBaseId: {
				$in: [showStyleBaseId, null],
			},
		})

		const upsertedDeviceTriggerMountedActionIds: DeviceTriggerMountedActionId[] = []
		const touchedActionIds: DeviceActionId[] = []

		this.tagsService.clearObservedTags()

		for (const rawTriggeredAction of allTriggeredActions) {
			const triggeredAction = convertDocument(rawTriggeredAction)

			if (!Object.values<SomeBlueprintTrigger>(triggeredAction.triggers).find(isDeviceTrigger)) continue

			const addedPreviewIds: PreviewWrappedAdLibId[] = []

			Object.entries<SomeAction>(triggeredAction.actions).forEach(([key, action]) => {
				// Since the compiled action is cached using this actionId as a key, having the action
				// and the filterChain allows for a quicker invalidation without doing a deepEquals
				const actionId = protectString<DeviceActionId>(
					`${studioId}_${triggeredAction._id}_${key}_${JSON.stringify(action)}`
				)
				const existingAction = actionManager.getAction(actionId)
				let thisAction: ExecutableAction
				// Use the cached action or put a new one in the cache
				if (existingAction) {
					thisAction = existingAction
				} else {
					const compiledAction = createAction(action, sourceLayers)
					actionManager.setAction(actionId, compiledAction)
					thisAction = compiledAction
				}
				touchedActionIds.push(actionId)

				Object.entries<SomeBlueprintTrigger>(triggeredAction.triggers).forEach(([key, trigger]) => {
					if (!isDeviceTrigger(trigger)) {
						return
					}

					let deviceActionArguments: ShiftRegisterActionArguments | undefined = undefined

					if (action.action === DeviceActions.modifyShiftRegister) {
						deviceActionArguments = {
							type: 'modifyRegister',
							register: action.register,
							operation: action.operation,
							value: action.value,
							limitMin: action.limitMin,
							limitMax: action.limitMax,
						}
					}

					const deviceTriggerMountedActionId = protectString<DeviceTriggerMountedActionId>(
						`${actionId}_${key}`
					)
					DeviceTriggerMountedActions.upsert(deviceTriggerMountedActionId, {
						$set: {
							studioId,
							showStyleBaseId,
							actionType: thisAction.action,
							actionId,
							deviceId: trigger.deviceId,
							deviceTriggerId: trigger.triggerId,
							values: trigger.values,
							deviceActionArguments,
							name: triggeredAction.name,
						},
					})
					upsertedDeviceTriggerMountedActionIds.push(deviceTriggerMountedActionId)
				})

				if (!isPreviewableAction(thisAction)) {
					const adLibPreviewId = protectString(`${actionId}_preview`)
					DeviceTriggerMountedActionAdlibsPreview.upsert(adLibPreviewId, {
						$set: literal<PreviewWrappedAdLib>({
							_id: adLibPreviewId,
							_rank: 0,
							partId: null,
							type: undefined,
							label: thisAction.action,
							item: null,
							triggeredActionId: triggeredAction._id,
							actionId,
							studioId,
							showStyleBaseId,
							sourceLayerType: undefined,
							sourceLayerName: undefined,
							styleClassNames: triggeredAction.styleClassNames,
							isCurrent: undefined,
							isNext: undefined,
						}),
					})

					addedPreviewIds.push(adLibPreviewId)
				} else {
					const previewedAdLibs = thisAction.preview(context)

					previewedAdLibs.forEach((adLib) => {
						const adLibPreviewId = protectString<PreviewWrappedAdLibId>(
							`${triggeredAction._id}_${studioId}_${key}_${adLib._id}`
						)
						this.tagsService.observeTallyTags(adLib)
						const { isCurrent, isNext } = this.tagsService.getTallyStateFromTags(adLib)
						DeviceTriggerMountedActionAdlibsPreview.upsert(adLibPreviewId, {
							$set: literal<PreviewWrappedAdLib>({
								...adLib,
								_id: adLibPreviewId,
								triggeredActionId: triggeredAction._id,
								actionId,
								studioId,
								showStyleBaseId,
								sourceLayerType: adLib.sourceLayerId
									? sourceLayers[adLib.sourceLayerId]?.type
									: undefined,
								sourceLayerName: adLib.sourceLayerId
									? {
											name: sourceLayers[adLib.sourceLayerId]?.name,
											abbreviation: sourceLayers[adLib.sourceLayerId]?.abbreviation,
									  }
									: undefined,
								styleClassNames: triggeredAction.styleClassNames,
								isCurrent,
								isNext,
							}),
						})

						addedPreviewIds.push(adLibPreviewId)
					})
				}
			})

			DeviceTriggerMountedActionAdlibsPreview.remove({
				triggeredActionId: triggeredAction._id,
				_id: {
					$nin: addedPreviewIds,
				},
			})
		}

		DeviceTriggerMountedActions.remove({
			studioId,
			showStyleBaseId,
			_id: {
				$nin: upsertedDeviceTriggerMountedActionIds,
			},
		})

		actionManager.deleteActionsOtherThan(touchedActionIds)
	}

	protected updateTriggersFromLastCache(): void {
		if (!this.lastCache || !this.#lastShowStyleBaseId) return
		this.updateTriggers(this.lastCache, this.#lastShowStyleBaseId)
	}

	updatePieceInstances(cache: PieceInstancesContentCache, showStyleBaseId: ShowStyleBaseId): void {
		const shouldUpdateTriggers = this.tagsService.updatePieceInstances(cache, showStyleBaseId)
		if (shouldUpdateTriggers) {
			this.updateTriggersFromLastCache()
		}
	}

	clearTriggers(): void {
		const studioId = this.studioId
		const showStyleBaseId = this.#lastShowStyleBaseId

		if (!showStyleBaseId) {
			return
		}

		const actionManager = StudioActionManagers.get(studioId)
		if (!actionManager)
			throw new Meteor.Error(
				500,
				`No Studio Action Manager available to handle action context in Studio "${studioId}"`
			)

		DeviceTriggerMountedActions.find({
			studioId,
			showStyleBaseId,
		}).forEach((mountedAction) => {
			actionManager.deleteAction(mountedAction.actionId)
		})
		DeviceTriggerMountedActions.remove({
			studioId,
			showStyleBaseId,
		})
		DeviceTriggerMountedActionAdlibsPreview.remove({
			studioId,
			showStyleBaseId,
		})
		actionManager.deleteContext()

		this.#lastShowStyleBaseId = null
	}

	stop(): void {
		this.clearTriggers()
		StudioActionManagers.delete(this.studioId)
	}
}

function convertDocument(doc: ReadonlyObjectDeep<DBTriggeredActions>): UITriggeredActionsObj {
	return literal<Complete<UITriggeredActionsObj>>({
		_id: doc._id,
		_rank: doc._rank,

		showStyleBaseId: doc.showStyleBaseId,
		name: doc.name,

		actions: applyAndValidateOverrides<Record<string, SomeAction>>(doc.actionsWithOverrides).obj,
		triggers: applyAndValidateOverrides<Record<string, SomeBlueprintTrigger>>(doc.triggersWithOverrides).obj,

		styleClassNames: doc.styleClassNames,
	})
}

function createCurrentContextFromCache(cache: ContentCache): ReactivePlaylistActionContext {
	const rundownPlaylist = cache.RundownPlaylists.findOne({
		activationId: {
			$exists: true,
		},
	})

	if (!rundownPlaylist) throw new Error('There should be an active RundownPlaylist!')

	const currentPartInstance = rundownPlaylist.currentPartInfo
		? cache.PartInstances.findOne(rundownPlaylist.currentPartInfo.partInstanceId)
		: undefined
	const nextPartInstance = rundownPlaylist.nextPartInfo
		? cache.PartInstances.findOne(rundownPlaylist.nextPartInfo.partInstanceId)
		: undefined

	const currentSegmentPartIds = currentPartInstance
		? cache.Parts.find({
				segmentId: currentPartInstance.part.segmentId,
		  }).map((part) => part._id)
		: []
	const nextSegmentPartIds = nextPartInstance
		? nextPartInstance.part.segmentId === currentPartInstance?.part.segmentId
			? currentSegmentPartIds
			: cache.Parts.find({
					segmentId: nextPartInstance.part.segmentId,
			  }).map((part) => part._id)
		: []

	return {
		currentPartInstanceId: new DummyReactiveVar(currentPartInstance?._id ?? null),
		currentPartId: new DummyReactiveVar(currentPartInstance?.part._id ?? null),
		nextPartId: new DummyReactiveVar(nextPartInstance?.part._id ?? null),
		currentRundownId: new DummyReactiveVar(
			currentPartInstance?.part.rundownId ?? nextPartInstance?.part.rundownId ?? null
		),
		rundownPlaylist: new DummyReactiveVar(rundownPlaylist),
		rundownPlaylistId: new DummyReactiveVar(rundownPlaylist._id),
		currentSegmentPartIds: new DummyReactiveVar(currentSegmentPartIds),
		nextSegmentPartIds: new DummyReactiveVar(nextSegmentPartIds),
	}
}
