import { Logger } from 'winston'
import { CoreHandler } from '../coreHandler'
import { CollectionBase, Collection, CollectionObserver } from '../wsHandler'
import { RundownBaselineAdLibAction } from '@sofie-automation/corelib/dist/dataModel/RundownBaselineAdLibAction'
import { DBPartInstance } from '@sofie-automation/corelib/dist/dataModel/PartInstance'
import { PartInstanceName } from './partInstances'
import { CollectionName } from '@sofie-automation/corelib/dist/dataModel/Collections'
import { CorelibPubSub } from '@sofie-automation/corelib/dist/pubsub'
import { RundownBaselineAdLibActionId, RundownId } from '@sofie-automation/corelib/dist/dataModel/Ids'

export class GlobalAdLibActionsHandler
	extends CollectionBase<
		RundownBaselineAdLibAction[],
		CorelibPubSub.rundownBaselineAdLibActions,
		CollectionName.RundownBaselineAdLibActions
	>
	implements
		Collection<RundownBaselineAdLibAction[]>,
		CollectionObserver<Map<PartInstanceName, DBPartInstance | undefined>>
{
	public observerName: string
	private _curRundownId: RundownId | undefined

	constructor(logger: Logger, coreHandler: CoreHandler) {
		super(
			GlobalAdLibActionsHandler.name,
			CollectionName.RundownBaselineAdLibActions,
			CorelibPubSub.rundownBaselineAdLibActions,
			logger,
			coreHandler
		)
		this.observerName = this._name
	}

	async changed(id: RundownBaselineAdLibActionId, changeType: string): Promise<void> {
		this._logger.info(`${this._name} ${changeType} ${id}`)
		if (!this._collectionName) return
		const col = this._core.getCollection(this._collectionName)
		if (!col) throw new Error(`collection '${this._collectionName}' not found!`)
		this._collectionData = col.find({ rundownId: this._curRundownId })
		await this.notify(this._collectionData)
	}

	async update(source: string, data: Map<PartInstanceName, DBPartInstance | undefined> | undefined): Promise<void> {
		this._logger.info(`${this._name} received partInstances update from ${source}`)
		const prevRundownId = this._curRundownId
		const partInstance = data ? data.get(PartInstanceName.current) ?? data.get(PartInstanceName.next) : undefined
		this._curRundownId = partInstance ? partInstance.rundownId : undefined

		await new Promise(process.nextTick.bind(this))
		if (!this._collectionName) return
		if (!this._publicationName) return
		if (prevRundownId !== this._curRundownId) {
			if (this._subscriptionId) this._coreHandler.unsubscribe(this._subscriptionId)
			if (this._dbObserver) this._dbObserver.stop()
			if (this._curRundownId) {
				this._subscriptionId = await this._coreHandler.setupSubscription(this._publicationName, [
					this._curRundownId,
				])
				this._dbObserver = this._coreHandler.setupObserver(this._collectionName)
				this._dbObserver.added = (id) => {
					void this.changed(id, 'added').catch(this._logger.error)
				}
				this._dbObserver.changed = (id) => {
					void this.changed(id, 'changed').catch(this._logger.error)
				}

				const collection = this._core.getCollection(this._collectionName)
				if (!collection) throw new Error(`collection '${this._collectionName}' not found!`)
				this._collectionData = collection.find({ rundownId: this._curRundownId })
				await this.notify(this._collectionData)
			}
		}
	}

	// override notify to implement empty array handling
	async notify(data: RundownBaselineAdLibAction[] | undefined): Promise<void> {
		this._logger.info(`${this._name} notifying update with ${data?.length} globalAdLibActions`)
		if (data !== undefined) {
			for (const observer of this._observers) {
				await observer.update(this._name, data)
			}
		}
	}
}
