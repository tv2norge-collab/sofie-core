import { StudioId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import { ChangeStream, ChangeStreamDocument, MongoClient } from 'mongodb'
import { LocksManager } from '../locks'
import { IngestWorkerParent } from './ingest/parent'
import { StudioWorkerParent } from './studio/parent'
import { EventsWorkerParent } from './events/parent'
import { JobManager } from '../manager'
import { FastTrackTimelineFunc, LogLineWithSourceFunc } from '../main'
import { WorkerParentBase } from './parent-base'
import { logger } from '../logging'
import { Blueprint } from '@sofie-automation/corelib/dist/dataModel/Blueprint'
import { CollectionName } from '@sofie-automation/corelib/dist/dataModel/Collections'
import { DBShowStyleBase } from '@sofie-automation/corelib/dist/dataModel/ShowStyleBase'
import { DBShowStyleVariant } from '@sofie-automation/corelib/dist/dataModel/ShowStyleVariant'
import { DBStudio } from '@sofie-automation/corelib/dist/dataModel/Studio'
import { stringifyError } from '@sofie-automation/corelib/dist/lib'
import { InvalidateWorkerDataCache } from './caches'

export class StudioWorkerSet {
	readonly #threads: WorkerParentBase[]
	readonly #locksManager: LocksManager

	readonly #studioId: StudioId
	readonly #mongoClient: MongoClient
	readonly #streams: Array<ChangeStream<any>> = []

	constructor(studioId: StudioId, mongoClient: MongoClient) {
		this.#threads = []
		this.#locksManager = new LocksManager(async (threadId, lockId, locked) => {
			// Check each thread in turn, to find the one that should be informed
			for (const thread of this.#threads) {
				if (thread.threadId === threadId) {
					await thread.workerLockChange(lockId, locked)
					return true
				}
			}

			// Unhandled lock event
			return false
		})

		this.#studioId = studioId
		this.#mongoClient = mongoClient
	}

	public static async create(
		workerId: string,
		mongoUri: string,
		dbName: string,
		mongoClient: MongoClient,
		studioId: StudioId,
		jobManager: JobManager,
		logLine: LogLineWithSourceFunc,
		fastTrackTimeline: FastTrackTimelineFunc | null
	): Promise<StudioWorkerSet> {
		const result = new StudioWorkerSet(studioId, mongoClient)

		let failed = 0
		const ps: Array<Promise<void>> = []

		const tryAddThread = (thread: Promise<WorkerParentBase>): void => {
			ps.push(
				thread.then(
					(th) => {
						result.#threads.push(th)
					},
					() => {
						failed++
					}
				)
			)
		}

		tryAddThread(
			StudioWorkerParent.start(
				workerId,
				mongoUri,
				dbName,
				mongoClient,
				result.#locksManager,
				studioId,
				jobManager,
				logLine,
				fastTrackTimeline
			)
		)

		tryAddThread(
			EventsWorkerParent.start(
				workerId,
				mongoUri,
				dbName,
				mongoClient,
				result.#locksManager,
				studioId,
				jobManager,
				logLine,
				fastTrackTimeline
			)
		)

		tryAddThread(
			IngestWorkerParent.start(
				workerId,
				mongoUri,
				dbName,
				mongoClient,
				result.#locksManager,
				studioId,
				jobManager,
				logLine,
				fastTrackTimeline
			)
		)

		logger.info(`Starting threads for ${studioId}`)
		await Promise.allSettled(ps)
		logger.info(`Started threads for ${studioId}`)

		if (failed > 0) {
			// terminate all the successful threads
			await result.terminate()
			throw new Error(`Failed to initialise ${failed} threads`)
		}

		result.subscribeToCommonCacheInvalidations(dbName)

		return result
	}

	/**
	 * Subscribe to core changes in the db for cache invalidation.
	 * Can be extended if move collections are watched for a thread type
	 */
	private subscribeToCommonCacheInvalidations(dbName: string): void {
		const attachChangesStream = <T>(
			stream: ChangeStream<T>,
			name: string,
			fcn: (invalidations: InvalidateWorkerDataCache, change: ChangeStreamDocument<T>) => void
		): void => {
			this.#streams.push(stream)
			stream.on('change', (change) => {
				// we have a change to flag
				for (const thread of this.#threads) {
					thread.queueCacheInvalidation((invalidations) =>
						fcn(invalidations, change as ChangeStreamDocument<T>)
					)
				}
			})
			stream.on('end', () => {
				logger.warn(`Changes stream for ${name} ended`)
				this.terminate().catch((e) => {
					logger.error(`Terminate of threads failed: ${stringifyError(e)}`)
				})
			})
		}

		const database = this.#mongoClient.db(dbName)
		attachChangesStream<DBStudio>(
			database.collection(CollectionName.Studios).watch([{ $match: { _id: this.#studioId } }], {
				batchSize: 1,
			}),
			`Studio "${this.#studioId}"`,
			(invalidations) => {
				invalidations.studio = true
			}
		)
		attachChangesStream<Blueprint>(
			// Detect changes to other docs, the invalidate will filter out irrelevant values
			database.collection(CollectionName.Blueprints).watch(
				[
					// Future: this should be scoped down when we have multiple studios in an installation
				],
				{
					batchSize: 1,
				}
			),
			`Blueprints"`,
			(invalidations, change) => {
				if (change.documentKey) {
					invalidations.blueprints.push((change.documentKey as any)._id)
				}
			}
		)
		attachChangesStream<DBShowStyleBase>(
			// Detect changes to other docs, the invalidate will filter out irrelevant values
			database.collection(CollectionName.ShowStyleBases).watch(
				[
					// Future: this should be scoped down when we have multiple studios in an installation
				],
				{
					batchSize: 1,
				}
			),
			`ShowStyleBases"`,
			(invalidations, change) => {
				if (change.documentKey) {
					invalidations.showStyleBases.push((change.documentKey as any)._id)
				}
			}
		)
		attachChangesStream<DBShowStyleVariant>(
			// Detect changes to other docs, the invalidate will filter out irrelevant values
			database.collection(CollectionName.ShowStyleVariants).watch(
				[
					// Future: this should be scoped down when we have multiple studios in an installation
				],
				{
					batchSize: 1,
				}
			),
			`ShowStyleVariants"`,
			(invalidations, change) => {
				if (change.documentKey) {
					invalidations.showStyleVariants.push((change.documentKey as any)._id)
				}
			}
		)
	}

	public async terminate(): Promise<void> {
		await Promise.allSettled(this.#threads.map((t) => t.terminate()))

		await Promise.allSettled(this.#streams.map((s) => s.close()))
	}
}