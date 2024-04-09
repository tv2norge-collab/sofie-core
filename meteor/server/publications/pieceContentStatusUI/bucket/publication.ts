import { PackageInfo } from '@sofie-automation/blueprints-integration'
import {
	BucketAdLibActionId,
	BucketAdLibId,
	BucketId,
	ExpectedPackageId,
	PackageContainerPackageId,
	StudioId,
} from '@sofie-automation/corelib/dist/dataModel/Ids'
import { MongoFieldSpecifierOnesStrict } from '@sofie-automation/corelib/dist/mongo'
import { ReadonlyDeep } from 'type-fest'
import { CustomCollectionName, PubSub } from '../../../../lib/api/pubsub'
import { UIBucketContentStatus } from '../../../../lib/api/rundownNotifications'
import { Buckets, MediaObjects, PackageContainerPackageStatuses, PackageInfos, Studios } from '../../../collections'
import { literal, protectString } from '../../../../lib/lib'
import {
	CustomPublishCollection,
	meteorCustomPublish,
	setUpCollectionOptimizedObserver,
	TriggerUpdate,
} from '../../../lib/customPublication'
import { logger } from '../../../logging'
import { resolveCredentials } from '../../../security/lib/credentials'
import { NoSecurityReadAccess } from '../../../security/noSecurity'
import { BucketContentCache, createReactiveContentCache } from './bucketContentCache'
import { LiveQueryHandle } from '../../../lib/lib'
import { StudioReadAccess } from '../../../security/studio'
import { Bucket } from '../../../../lib/collections/Buckets'
import {
	addItemsWithDependenciesChangesToChangedSet,
	fetchStudio,
	IContentStatusesUpdatePropsBase,
	mediaObjectFieldSpecifier,
	packageContainerPackageStatusesFieldSpecifier,
	packageInfoFieldSpecifier,
	PieceDependencies,
	studioFieldSpecifier,
} from '../common'
import { BucketContentObserver } from './bucketContentObserver'
import { regenerateForBucketActionIds, regenerateForBucketAdLibIds } from './regenerateForItem'
import { PieceContentStatusStudio } from '../checkPieceContentStatus'
import { BucketSecurity } from '../../../security/buckets'
import { check } from 'meteor/check'

interface UIBucketContentStatusesArgs {
	readonly studioId: StudioId
	readonly bucketId: BucketId
}

interface UIBucketContentStatusesState {
	contentCache: ReadonlyDeep<BucketContentCache>

	studio: PieceContentStatusStudio

	adlibDependencies: Map<BucketAdLibId, PieceDependencies>
	actionDependencies: Map<BucketAdLibActionId, PieceDependencies>
}

interface UIBucketContentStatusesUpdateProps extends IContentStatusesUpdatePropsBase {
	newCache: BucketContentCache

	invalidateBucketAdlibIds: BucketAdLibId[]
	invalidateBucketActionIds: BucketAdLibActionId[]
}

type BucketFields = '_id' | 'studioId'
const bucketFieldSpecifier = literal<MongoFieldSpecifierOnesStrict<Pick<Bucket, BucketFields>>>({
	_id: 1,
	studioId: 1,
})

async function setupUIBucketContentStatusesPublicationObservers(
	args: ReadonlyDeep<UIBucketContentStatusesArgs>,
	triggerUpdate: TriggerUpdate<UIBucketContentStatusesUpdateProps>
): Promise<LiveQueryHandle[]> {
	const trackMediaObjectChange = (mediaId: string): Partial<UIBucketContentStatusesUpdateProps> => ({
		invalidateMediaObjectMediaId: [mediaId],
	})
	const trackPackageInfoChange = (id: ExpectedPackageId): Partial<UIBucketContentStatusesUpdateProps> => ({
		invalidateExpectedPackageId: [id],
	})
	const trackPackageContainerPackageStatusChange = (
		id: PackageContainerPackageId
	): Partial<UIBucketContentStatusesUpdateProps> => ({
		invalidatePackageContainerPackageStatusesId: [id],
	})

	const trackAdlibChange = (id: BucketAdLibId): Partial<UIBucketContentStatusesUpdateProps> => ({
		invalidateBucketAdlibIds: [id],
	})
	const trackActionChange = (id: BucketAdLibActionId): Partial<UIBucketContentStatusesUpdateProps> => ({
		invalidateBucketActionIds: [id],
	})

	// Future: we should watch to make sure the studioId of the bucket doesnt change
	const bucket = (await Buckets.findOneAsync(args.bucketId, {
		projection: bucketFieldSpecifier,
	})) as Pick<Bucket, BucketFields> | undefined
	if (!bucket || bucket.studioId !== args.studioId) throw new Error(`Bucket "${args.bucketId}" not found!`)

	const contentCache = createReactiveContentCache()
	triggerUpdate({ newCache: contentCache })

	// Set up observers:
	return [
		new BucketContentObserver(args.bucketId, contentCache),

		contentCache.BucketAdLibs.find({}).observeChanges({
			added: (id) => triggerUpdate(trackAdlibChange(protectString(id))),
			changed: (id) => triggerUpdate(trackAdlibChange(protectString(id))),
			removed: (id) => triggerUpdate(trackAdlibChange(protectString(id))),
		}),
		contentCache.BucketAdLibActions.find({}).observeChanges({
			added: (id) => triggerUpdate(trackActionChange(protectString(id))),
			changed: (id) => triggerUpdate(trackActionChange(protectString(id))),
			removed: (id) => triggerUpdate(trackActionChange(protectString(id))),
		}),

		Studios.observeChanges(
			{ _id: bucket.studioId },
			{
				added: (id) => triggerUpdate({ invalidateStudio: id }),
				changed: (id) => triggerUpdate({ invalidateStudio: id }),
				removed: (id) => triggerUpdate({ invalidateStudio: id }),
			},
			{ projection: studioFieldSpecifier }
		),

		// Watch for affecting objects
		MediaObjects.observe(
			{ studioId: bucket.studioId },
			{
				added: (obj) => triggerUpdate(trackMediaObjectChange(obj.mediaId)),
				changed: (obj) => triggerUpdate(trackMediaObjectChange(obj.mediaId)),
				removed: (obj) => triggerUpdate(trackMediaObjectChange(obj.mediaId)),
			},
			{ projection: mediaObjectFieldSpecifier }
		),
		PackageInfos.observe(
			{
				studioId: bucket.studioId,
				type: {
					$in: [PackageInfo.Type.SCAN, PackageInfo.Type.DEEPSCAN],
				},
			},
			{
				added: (obj) => triggerUpdate(trackPackageInfoChange(obj.packageId)),
				changed: (obj) => triggerUpdate(trackPackageInfoChange(obj.packageId)),
				removed: (obj) => triggerUpdate(trackPackageInfoChange(obj.packageId)),
			},
			{ projection: packageInfoFieldSpecifier }
		),
		PackageContainerPackageStatuses.observeChanges(
			{ studioId: bucket.studioId },
			{
				added: (id) => triggerUpdate(trackPackageContainerPackageStatusChange(id)),
				changed: (id) => triggerUpdate(trackPackageContainerPackageStatusChange(id)),
				removed: (id) => triggerUpdate(trackPackageContainerPackageStatusChange(id)),
			},
			{ projection: packageContainerPackageStatusesFieldSpecifier }
		),
	]
}

async function manipulateUIBucketContentStatusesPublicationData(
	_args: UIBucketContentStatusesArgs,
	state: Partial<UIBucketContentStatusesState>,
	collection: CustomPublishCollection<UIBucketContentStatus>,
	updateProps: Partial<ReadonlyDeep<UIBucketContentStatusesUpdateProps>> | undefined
): Promise<void> {
	// Prepare data for publication:

	// Ensure the cached studio/showstyle id are updated
	const invalidateAllItems =
		!updateProps || updateProps.newCache || updateProps.invalidateStudio || updateProps.invalidateAll

	if (invalidateAllItems) {
		// Everything is invalid, reset everything
		delete state.adlibDependencies
		delete state.actionDependencies
		collection.remove(null)
	}

	if (updateProps?.invalidateStudio) {
		state.studio = await fetchStudio(updateProps.invalidateStudio)
	}

	if (updateProps?.newCache !== undefined) {
		state.contentCache = updateProps.newCache
	}

	// If there is no studio, then none of the objects should have been found, so delete anything that is known
	if (!state.studio || !state.contentCache) {
		delete state.adlibDependencies
		delete state.actionDependencies

		// None are valid anymore
		collection.remove(null)

		return
	}

	let regenerateActionIds: Set<BucketAdLibActionId>
	let regenerateAdlibIds: Set<BucketAdLibId>
	if (!state.adlibDependencies || !state.actionDependencies || invalidateAllItems) {
		state.adlibDependencies = new Map()
		state.actionDependencies = new Map()

		// force every piece to be regenerated
		collection.remove(null)
		regenerateAdlibIds = new Set(state.contentCache.BucketAdLibs.find({}).map((p) => p._id))
		regenerateActionIds = new Set(state.contentCache.BucketAdLibActions.find({}).map((p) => p._id))
	} else {
		regenerateAdlibIds = new Set(updateProps.invalidateBucketAdlibIds)
		regenerateActionIds = new Set(updateProps.invalidateBucketActionIds)

		// Look for which docs should be updated based on the media objects/packages
		addItemsWithDependenciesChangesToChangedSet<BucketAdLibId>(
			updateProps,
			regenerateAdlibIds,
			state.adlibDependencies
		)
		addItemsWithDependenciesChangesToChangedSet<BucketAdLibActionId>(
			updateProps,
			regenerateActionIds,
			state.actionDependencies
		)
	}

	await regenerateForBucketAdLibIds(
		state.contentCache,
		state.studio,
		state.adlibDependencies,
		collection,
		regenerateAdlibIds
	)
	await regenerateForBucketActionIds(
		state.contentCache,
		state.studio,
		state.actionDependencies,
		collection,
		regenerateActionIds
	)
}

meteorCustomPublish(
	PubSub.uiBucketContentStatuses,
	CustomCollectionName.UIBucketContentStatuses,
	async function (pub, studioId: StudioId, bucketId: BucketId) {
		check(studioId, String)
		check(bucketId, String)

		const cred = await resolveCredentials({ userId: this.userId, token: undefined })

		if (
			NoSecurityReadAccess.any() ||
			(studioId &&
				bucketId &&
				(await StudioReadAccess.studioContent(studioId, cred)) &&
				(await BucketSecurity.allowReadAccess(cred, bucketId)))
		) {
			await setUpCollectionOptimizedObserver<
				UIBucketContentStatus,
				UIBucketContentStatusesArgs,
				UIBucketContentStatusesState,
				UIBucketContentStatusesUpdateProps
			>(
				`pub_${PubSub.uiBucketContentStatuses}_${studioId}_${bucketId}`,
				{ studioId, bucketId },
				setupUIBucketContentStatusesPublicationObservers,
				manipulateUIBucketContentStatusesPublicationData,
				pub,
				100
			)
		} else {
			logger.warn(`Pub.${CustomCollectionName.UIBucketContentStatuses}: Not allowed: "${studioId}" "${bucketId}"`)
		}
	}
)
