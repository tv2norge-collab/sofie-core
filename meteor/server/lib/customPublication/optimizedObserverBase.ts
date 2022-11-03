import deepmerge from 'deepmerge'
import { Meteor } from 'meteor/meteor'
import { ReadonlyDeep } from 'type-fest'
import { clone, createManualPromise, lazyIgnore, ProtectedString, stringifyError } from '../../../lib/lib'
import { logger } from '../../logging'
import { CustomPublish, CustomPublishChanges } from './publish'

interface OptimizedObserverWrapper<TData extends { _id: ProtectedString<any> }, TArgs, TContext> {
	/** Subscribers ready for data updates */
	activeSubscribers: Array<CustomPublish<TData>>
	/** New subscribers that are awaiting their initial data */
	newSubscribers: Array<CustomPublish<TData>>

	/** When set, the observer is initialised, and interested in being told when subscribers join or leave */
	subscribersChanged?: () => void

	/** The innards of the observer, this takes some time to initialize, but we can let subscribers join and leave while it runs */
	worker: Promise<OptimizedObserverWorker<TData, TArgs, TContext>>
}

interface OptimizedObserverWorker<TData extends { _id: ProtectedString<any> }, TArgs, TContext> {
	args: ReadonlyDeep<TArgs>
	context: Partial<TContext>
	lastData: TData[]
	stopObservers: () => void
}

/** Optimized observers */
const optimizedObservers: Record<string, OptimizedObserverWrapper<any, unknown, unknown>> = {}

export type TriggerUpdate<UpdateProps extends Record<string, any>> = (
	updateProps: Partial<UpdateProps>,
	invalidateObservers?: boolean
) => void

/**
 * This should not be used directly, and should be used through one of the setUpOptimizedObserverArray or setUpCollectionOptimizedObserver wrappers
 *
 * This is an optimization to enable multiple listeners that observes (and manipulates) the same data, to only use one observer and manipulator,
 * then receive the result for each listener.
 *
 * @param identifier identifier, shared between the listeners that use the same observer.
 * @param setupObservers Set up the observers. This is run just 1 times for N listeners, on initialization.
 * @param manipulateData Manipulate the data. This is run 1 times for N listeners, per data update. (and on initialization). Return an array of all the documents, and an object describing the changes
 * @param receiver The CustomPublish for the subscriber that wants to create (or be added to) the observer
 * @param lazynessDuration (Optional) How long to wait after a change before issueing an update. Default to 3 ms
 */
export async function setUpOptimizedObserverInner<
	PublicationDoc extends { _id: ProtectedString<any> },
	Args,
	State extends Record<string, any>,
	UpdateProps extends Record<string, any>
>(
	identifier: string,
	args0: ReadonlyDeep<Args>,
	setupObservers: (
		args: ReadonlyDeep<Args>,
		/** Trigger an update by mutating the context of manipulateData */
		triggerUpdate: TriggerUpdate<UpdateProps>
	) => Promise<Meteor.LiveQueryHandle[]>,
	manipulateData: (
		args: ReadonlyDeep<Args>,
		state: Partial<State>,
		newProps: ReadonlyDeep<Partial<UpdateProps> | undefined>
	) => Promise<[PublicationDoc[], CustomPublishChanges<PublicationDoc>]>,
	receiver: CustomPublish<PublicationDoc>,
	lazynessDuration: number = 3 // ms
): Promise<void> {
	let thisObserverWrapper = optimizedObservers[identifier] as
		| OptimizedObserverWrapper<PublicationDoc, Args, State>
		| undefined

	// Once this receiver stops, this will be called to remove it from the subscriber lists
	function removeReceiver() {
		if (thisObserverWrapper) {
			const i = thisObserverWrapper.activeSubscribers.indexOf(receiver)
			if (i !== -1) thisObserverWrapper.activeSubscribers.splice(i, 1)

			const i2 = thisObserverWrapper.newSubscribers.indexOf(receiver)
			if (i2 !== -1) thisObserverWrapper.newSubscribers.splice(i2, 1)

			// clean up if empty:
			if (
				!thisObserverWrapper.activeSubscribers.length &&
				!thisObserverWrapper.newSubscribers.length &&
				thisObserverWrapper.subscribersChanged
			) {
				thisObserverWrapper.subscribersChanged()
			}
		}
	}

	if (thisObserverWrapper) {
		// There is an existing optimizedObserver

		// Add the new subscriber
		thisObserverWrapper.newSubscribers.push(receiver)
		receiver.onStop(() => removeReceiver())

		// If the optimizedObserver is setup, we can notify it that we need data
		if (thisObserverWrapper.subscribersChanged) thisObserverWrapper.subscribersChanged()

		// Wait for the observer to be ready
		await thisObserverWrapper.worker
	} else {
		const resultingOptimizedObserver = createManualPromise<OptimizedObserverWorker<PublicationDoc, Args, State>>()
		resultingOptimizedObserver.catch(() => null) // ensure resultingOptimizedObserver doesn't go uncaught

		// Store the optimizedObserver, so that other subscribers can join onto this without creating their own
		thisObserverWrapper = optimizedObservers[identifier] = {
			newSubscribers: [receiver],
			activeSubscribers: [],
			worker: resultingOptimizedObserver,
		}
		receiver.onStop(() => removeReceiver())

		// Start the optimizedObserver
		try {
			const observerWorker = await createOptimizedObserverWorker(
				identifier,
				thisObserverWrapper,
				args0,
				setupObservers,
				manipulateData,
				lazynessDuration
			)

			Meteor.defer(() => {
				resultingOptimizedObserver.manualResolve(observerWorker)
			})
		} catch (e: any) {
			// The setup failed, so delete and cleanup the in-progress observer
			delete optimizedObservers[identifier]

			Meteor.defer(() => {
				// Propogate to other susbcribers
				resultingOptimizedObserver.manualReject(e)
			})

			// Propogate to the susbcriber that started this
			throw e
		}
	}
}

/**
 * Get the number of subscribers for an OptimizedObserver
 * @param identifier identifier, shared between the listeners that use the same observer.
 */
export function optimizedObserverCountSubscribers(identifier: string): number | null {
	if (optimizedObservers[identifier]) {
		return (
			optimizedObservers[identifier].activeSubscribers.length +
			optimizedObservers[identifier].newSubscribers.length
		)
	} else {
		return null
	}
}

/**
 * Create the worker component of the optimizedObserver, that handles the subscriptions and data processing
 */
async function createOptimizedObserverWorker<
	PublicationDoc extends { _id: ProtectedString<any> },
	Args,
	State extends Record<string, any>,
	UpdateProps extends Record<string, any>
>(
	identifier: string,
	thisObserverWrapper: OptimizedObserverWrapper<PublicationDoc, Args, State>,
	args0: ReadonlyDeep<Args>,
	setupObservers: (
		args: ReadonlyDeep<Args>,
		/** Trigger an update by mutating the context of manipulateData */
		triggerUpdate: TriggerUpdate<UpdateProps>
	) => Promise<Meteor.LiveQueryHandle[]>,
	manipulateData: (
		args: ReadonlyDeep<Args>,
		state: Partial<State>,
		newProps: ReadonlyDeep<Partial<UpdateProps> | undefined>
	) => Promise<[PublicationDoc[], CustomPublishChanges<PublicationDoc>]>,
	lazynessDuration: number // ms
): Promise<OptimizedObserverWorker<PublicationDoc, Args, State>> {
	let thisObserverWorker: OptimizedObserverWorker<PublicationDoc, Args, State> | undefined
	let updateIsRunning = true

	const args = clone<ReadonlyDeep<Args>>(args0)

	const abortExecution = (reason: Meteor.Error) => {
		if (thisObserverWrapper) {
			for (const sub of thisObserverWrapper.activeSubscribers) {
				sub.error(reason)
			}
			for (const sub of thisObserverWrapper.newSubscribers) {
				sub.error(reason)
			}
		}
	}

	let hasPendingInvalidateObservers = false
	let hasPendingUpdate = false
	let pendingUpdate: Record<string, any> = {}
	const triggerUpdate: TriggerUpdate<UpdateProps> = (updateProps, invalidateObservers) => {
		// Combine the pending updates
		pendingUpdate = deepmerge(pendingUpdate, updateProps)

		if (invalidateObservers) hasPendingInvalidateObservers = true

		// If already running, set it as pending to be done afterwards
		if (updateIsRunning) {
			hasPendingUpdate = true
			return
		}

		// We are handling the update
		hasPendingUpdate = false

		// This could have multiple concurrent executions, but it shouldnt due to the boolean guards
		lazyIgnore(
			`optimizedObserver_${identifier}`,
			async () => {
				try {
					// Mark the update as running
					updateIsRunning = true

					if (thisObserverWrapper && thisObserverWorker) {
						if (
							!thisObserverWrapper.activeSubscribers.length &&
							!thisObserverWrapper.newSubscribers.length
						) {
							delete optimizedObservers[identifier]
							thisObserverWorker.stopObservers()
							return
						}

						if (hasPendingInvalidateObservers) {
							thisObserverWorker.stopObservers()
							thisObserverWorker.stopObservers = () => null // Temporary clear the callback

							try {
								// Replace with new observers
								const newObservers = await setupObservers(args, triggerUpdate)
								thisObserverWorker.stopObservers = () => {
									newObservers.forEach((observer) => observer.stop())
								}
							} catch (e) {
								// If it errored, then the publication is dead
								// And we might have some orphaned mongo handles that were never returned..
								abortExecution(new Meteor.Error(500, `Obervers failed to renew: ${stringifyError(e)}`))
								return
							}
						}

						// Fetch and clear the pending updates
						const newProps = pendingUpdate as ReadonlyDeep<Partial<UpdateProps>>
						pendingUpdate = {}

						const start = Date.now()
						const [newDocs, changes] = await manipulateData(
							thisObserverWorker.args,
							thisObserverWorker.context,
							newProps
						)
						const manipulateTime = Date.now()
						const manipulateDuration = manipulateTime - start

						const hasChanges =
							changes.added.length > 0 || changes.changed.length > 0 || changes.removed.length > 0

						// If result === null, that means no changes were made
						if (hasChanges) {
							for (const dataReceiver of thisObserverWrapper.activeSubscribers) {
								dataReceiver.changed(changes)
							}
							thisObserverWorker.lastData = newDocs
						}
						if (thisObserverWrapper.newSubscribers.length) {
							const newDataReceivers = thisObserverWrapper.newSubscribers
							// Move to 'active' receivers
							thisObserverWrapper.activeSubscribers.push(...newDataReceivers)
							thisObserverWrapper.newSubscribers = []
							// send initial data
							for (const dataReceiver of newDataReceivers) {
								dataReceiver.init(thisObserverWorker.lastData)
							}
						}

						const publishTime = Date.now() - manipulateTime
						const totalTime = Date.now() - start

						/** Limit for what to consider a slow observer */
						const SLOW_OBSERVE_TIME = 50 // ms

						if (totalTime > SLOW_OBSERVE_TIME) {
							logger.debug(
								`Slow optimized observer ${identifier}. Total: ${totalTime}, manipulate: ${manipulateDuration}, publish: ${publishTime} (receivers: ${thisObserverWrapper.activeSubscribers.length})`
							)
						}
					}
				} catch (e) {
					logger.error(`optimizedObserver ${identifier} errored: ${stringifyError(e)}`)
				} finally {
					// Update has finished, check if another needs to be performed
					updateIsRunning = false

					if (hasPendingUpdate) {
						// There is another pending update, make sure it gets executed asap
						Meteor.defer(() => {
							triggerUpdate({})
						})
					}
				}
			},
			lazynessDuration // ms
		)
	}

	try {
		// Setup the mongo observers
		const observers = await setupObservers(args, triggerUpdate)

		thisObserverWorker = {
			args: args,
			context: {},
			lastData: [],
			stopObservers: () => {
				observers.forEach((observer) => observer.stop())
			},
		}

		// Do the intial data load
		const [result] = await manipulateData(args, thisObserverWorker.context, undefined)
		thisObserverWorker.lastData = result

		const newDataReceivers = thisObserverWrapper.newSubscribers
		if (newDataReceivers.length === 0) {
			// There is no longer any subscriber to this
			delete optimizedObservers[identifier]
			thisObserverWorker.stopObservers()

			throw new Meteor.Error(500, 'All subscribers disappeared!')
		}

		// Let subscribers notify that they have unsubscribe
		thisObserverWrapper.subscribersChanged = () => triggerUpdate({})

		// Promote the initial new subscribers to active
		thisObserverWrapper.newSubscribers = []
		thisObserverWrapper.activeSubscribers = newDataReceivers
		for (const receiver of newDataReceivers) {
			receiver.init(result)
		}
		updateIsRunning = false

		if (hasPendingUpdate) {
			// An update is pending, let it be executed once the final observer is stored
			Meteor.defer(() => {
				triggerUpdate({})
			})
		}

		// Observer is now ready for all to use
		return thisObserverWorker
	} catch (e: any) {
		if (thisObserverWorker) thisObserverWorker.stopObservers()

		throw e
	}
}
