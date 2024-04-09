import { Meteor } from 'meteor/meteor'
import { RundownId, RundownPlaylistId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import _ from 'underscore'
import { Rundowns } from '../../collections'
import { literal } from '@sofie-automation/corelib/dist/lib'
import { MongoFieldSpecifierOnesStrict } from '@sofie-automation/corelib/dist/mongo'
import { DBRundown } from '@sofie-automation/corelib/dist/dataModel/Rundown'

const REACTIVITY_DEBOUNCE = 20

type ChangedHandler = (rundownIds: RundownId[]) => () => void

type RundownFields = '_id'
const rundownFieldSpecifier = literal<MongoFieldSpecifierOnesStrict<Pick<DBRundown, RundownFields>>>({
	_id: 1,
})

export class RundownsObserver {
	#rundownsLiveQuery: Meteor.LiveQueryHandle
	#rundownIds: Set<RundownId> = new Set<RundownId>()
	#changed: ChangedHandler | undefined
	#cleanup: (() => void) | undefined

	constructor(activePlaylistId: RundownPlaylistId, onChanged: ChangedHandler) {
		this.#changed = onChanged
		this.#rundownsLiveQuery = Rundowns.observeChanges(
			{
				playlistId: activePlaylistId,
			},
			{
				added: (rundownId) => {
					this.#rundownIds.add(rundownId)
					this.updateRundownContent()
				},
				removed: (rundownId) => {
					this.#rundownIds.delete(rundownId)
					this.updateRundownContent()
				},
			},
			{
				projection: rundownFieldSpecifier,
			}
		)
		this.updateRundownContent()
	}

	public get rundownIds(): RundownId[] {
		return Array.from(this.#rundownIds)
	}

	private innerUpdateRundownContent = () => {
		if (!this.#changed) return
		this.#cleanup?.()

		const changed = this.#changed
		this.#cleanup = changed(this.rundownIds)
	}

	public updateRundownContent = _.debounce(
		Meteor.bindEnvironment(this.innerUpdateRundownContent),
		REACTIVITY_DEBOUNCE
	)

	public stop = (): void => {
		this.updateRundownContent.cancel()
		this.#rundownsLiveQuery.stop()
		this.#changed = undefined
		this.#cleanup?.()
	}
}
