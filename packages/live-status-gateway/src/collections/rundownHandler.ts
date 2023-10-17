import { Logger } from 'winston'
import { CoreHandler } from '../coreHandler'
import { CollectionBase, Collection, CollectionObserver } from '../wsHandler'
import { CoreConnection } from '@sofie-automation/server-core-integration'
import { DBRundownPlaylist } from '@sofie-automation/corelib/dist/dataModel/RundownPlaylist'
import { DBPartInstance } from '@sofie-automation/corelib/dist/dataModel/PartInstance'
import { DBRundown } from '@sofie-automation/corelib/dist/dataModel/Rundown'
import { protectString } from '@sofie-automation/shared-lib/dist/lib/protectedString'
import { PartInstanceName, PartInstancesHandler } from './partInstancesHandler'
import { RundownId, RundownPlaylistId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import { CollectionName } from '@sofie-automation/corelib/dist/dataModel/Collections'
import { PlaylistHandler } from './playlistHandler'
import { RundownsHandler } from './rundownsHandler'

export class RundownHandler
	extends CollectionBase<DBRundown>
	implements
		Collection<DBRundown>,
		CollectionObserver<DBRundownPlaylist>,
		CollectionObserver<Map<PartInstanceName, DBPartInstance | undefined>>
{
	public observerName: string
	private _core: CoreConnection
	private _curPlaylistId: RundownPlaylistId | undefined
	private _curRundownId: RundownId | undefined

	constructor(logger: Logger, coreHandler: CoreHandler, private _rundownsHandler?: RundownsHandler) {
		super(RundownHandler.name, CollectionName.Rundowns, 'rundowns', logger, coreHandler)
		this._core = coreHandler.coreConnection
		this.observerName = this._name
	}

	async changed(id: string, changeType: string): Promise<void> {
		this._logger.info(`${this._name} ${changeType} ${id}`)
		if (protectString(id) !== this._curRundownId)
			throw new Error(`${this._name} received change with unexpected id ${id} !== ${this._curRundownId}`)
		if (!this._collectionName) return
		const collection = this._core.getCollection<DBRundown>(this._collectionName)
		if (!collection) throw new Error(`collection '${this._collectionName}' not found!`)
		await this._rundownsHandler?.setRundowns(collection.find(undefined))
		if (this._collectionData) this._collectionData = collection.findOne(this._collectionData._id)
		await this.notify(this._collectionData)
	}

	async update(
		source: string,
		data: DBRundownPlaylist | Map<PartInstanceName, DBPartInstance | undefined> | undefined
	): Promise<void> {
		const prevPlaylistId = this._curPlaylistId
		const prevCurRundownId = this._curRundownId
		const rundownPlaylist = data ? (data as DBRundownPlaylist) : undefined
		const partInstances = data as Map<PartInstanceName, DBPartInstance | undefined>
		switch (source) {
			case PlaylistHandler.name:
				this._logger.info(`${this._name} received playlist update ${rundownPlaylist?._id}`)
				this._curPlaylistId = rundownPlaylist?._id
				break
			case PartInstancesHandler.name:
				this._logger.info(`${this._name} received partInstances update from ${source}`)
				this._curRundownId = partInstances.get(PartInstanceName.current)?.rundownId
				break
			default:
				throw new Error(`${this._name} received unsupported update from ${source}}`)
		}

		await new Promise(process.nextTick.bind(this))
		if (!this._collectionName) return
		if (!this._publicationName) return
		if (prevPlaylistId !== this._curPlaylistId) {
			if (this._subscriptionId) this._coreHandler.unsubscribe(this._subscriptionId)
			if (this._dbObserver) this._dbObserver.stop()
			if (this._curPlaylistId) {
				this._subscriptionId = await this._coreHandler.setupSubscription(
					this._publicationName,
					[this._curPlaylistId],
					undefined
				)
				this._dbObserver = this._coreHandler.setupObserver(this._collectionName)
				this._dbObserver.added = (id: string) => {
					void this.changed(id, 'added').catch(this._logger.error)
				}
				this._dbObserver.changed = (id: string) => {
					void this.changed(id, 'changed').catch(this._logger.error)
				}
			}
		}

		if (prevCurRundownId !== this._curRundownId) {
			if (this._curRundownId) {
				const collection = this._core.getCollection<DBRundown>(this._collectionName)
				if (!collection) throw new Error(`collection '${this._collectionName}' not found!`)
				const rundown = collection.findOne(this._curRundownId)
				if (!rundown) throw new Error(`rundown '${this._curRundownId}' not found!`)
				this._collectionData = rundown
			} else this._collectionData = undefined
			await this.notify(this._collectionData)
		}
	}
}
