import { Logger } from 'winston'
import { CoreHandler } from '../coreHandler'
import { CollectionBase, Collection, CollectionObserver } from '../wsHandler'
import { RundownBaselineAdLibItem } from '@sofie-automation/corelib/dist/dataModel/RundownBaselineAdLibPiece'
import { CollectionName } from '@sofie-automation/corelib/dist/dataModel/Collections'
import { CorelibPubSub } from '@sofie-automation/corelib/dist/pubsub'
import { PieceId, RundownId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import { SelectedPartInstances } from './partInstancesHandler'

export class GlobalAdLibsHandler
	extends CollectionBase<
		RundownBaselineAdLibItem[],
		CorelibPubSub.rundownBaselineAdLibPieces,
		CollectionName.RundownBaselineAdLibPieces
	>
	implements Collection<RundownBaselineAdLibItem[]>, CollectionObserver<SelectedPartInstances>
{
	public observerName: string
	private _currentRundownId: RundownId | undefined

	constructor(logger: Logger, coreHandler: CoreHandler) {
		super(
			GlobalAdLibsHandler.name,
			CollectionName.RundownBaselineAdLibPieces,
			CorelibPubSub.rundownBaselineAdLibPieces,
			logger,
			coreHandler
		)
		this.observerName = this._name
	}

	async changed(id: PieceId, changeType: string): Promise<void> {
		this.logDocumentChange(id, changeType)
		if (!this._collectionName) return
		const collection = this._core.getCollection<RundownBaselineAdLibItem>(this._collectionName)
		if (!collection) throw new Error(`collection '${this._collectionName}' not found!`)
		this._collectionData = collection.find({ rundownId: this._currentRundownId })
		await this.notify(this._collectionData)
	}

	async update(source: string, data: SelectedPartInstances | undefined): Promise<void> {
		this.logUpdateReceived('globalAdLibs', source)
		const prevRundownId = this._currentRundownId
		const partInstance = data ? data.current ?? data.next : undefined
		this._currentRundownId = partInstance?.rundownId

		await new Promise(process.nextTick.bind(this))
		if (!this._collectionName) return
		if (!this._publicationName) return
		if (prevRundownId !== this._currentRundownId) {
			if (this._subscriptionId) this._coreHandler.unsubscribe(this._subscriptionId)
			if (this._dbObserver) this._dbObserver.stop()
			if (this._currentRundownId) {
				this._subscriptionId = await this._coreHandler.setupSubscription(
					this._publicationName,
					{
						rundownId: this._currentRundownId,
					},
					true
				)
				// this._subscriptionId = await this._coreHandler.setupSubscription(this._publicationName, [
				// 	this._currentRundownId,
				// ]) // In R51
				this._dbObserver = this._coreHandler.setupObserver(this._collectionName)
				this._dbObserver.added = (id) => {
					void this.changed(id, 'added').catch(this._logger.error)
				}
				this._dbObserver.changed = (id) => {
					void this.changed(id, 'changed').catch(this._logger.error)
				}
				this._dbObserver.removed = (id) => {
					void this.changed(id, 'removed').catch(this._logger.error)
				}

				const collection = this._core.getCollection<RundownBaselineAdLibItem>(this._collectionName)
				if (!collection) throw new Error(`collection '${this._collectionName}' not found!`)
				this._collectionData = collection.find({ rundownId: this._currentRundownId })
				await this.notify(this._collectionData)
			}
		}
	}

	// override notify to implement empty array handling
	async notify(data: RundownBaselineAdLibItem[] | undefined): Promise<void> {
		this.logNotifyingUpdate(data?.length)
		if (data !== undefined) {
			for (const observer of this._observers) {
				await observer.update(this._name, data)
			}
		}
	}
}
