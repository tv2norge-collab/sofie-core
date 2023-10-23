import { Logger } from 'winston'
import { WebSocket } from 'ws'
import { unprotectString } from '@sofie-automation/shared-lib/dist/lib/protectedString'
import { DBStudio } from '@sofie-automation/corelib/dist/dataModel/Studio'
import { DBRundownPlaylist } from '@sofie-automation/corelib/dist/dataModel/RundownPlaylist'
import { literal } from '@sofie-automation/shared-lib/dist/lib/lib'
import { WebSocketTopicBase, WebSocketTopic, CollectionObserver } from '../wsHandler'
import { StudioHandler } from '../collections/studioHandler'
import { PlaylistsHandler } from '../collections/playlistHandler'

type PlaylistActivationStatus = 'deactivated' | 'rehearsal' | 'activated'

interface PlaylistStatus {
	id: string
	name: string
	activationStatus: PlaylistActivationStatus
}

interface StudioStatus {
	event: string
	id: string | null
	name: string
	playlists: PlaylistStatus[]
}

export class StudioTopic
	extends WebSocketTopicBase
	implements WebSocketTopic, CollectionObserver<DBStudio>, CollectionObserver<DBRundownPlaylist[]>
{
	public observerName = 'StudioTopic'
	private _studio: DBStudio | undefined
	private _playlists: PlaylistStatus[] = []

	constructor(logger: Logger) {
		super(StudioTopic.name, logger)
	}

	addSubscriber(ws: WebSocket): void {
		super.addSubscriber(ws)
		this.sendStatus([ws])
	}

	sendStatus(subscribers: Iterable<WebSocket>): void {
		const studioStatus: StudioStatus = this._studio
			? {
					event: 'studio',
					id: unprotectString(this._studio._id),
					name: this._studio.name,
					playlists: this._playlists,
			  }
			: {
					event: 'studio',
					id: null,
					name: '',
					playlists: [],
			  }
		for (const subscriber of subscribers) {
			this.sendMessage(subscriber, studioStatus)
		}
	}

	async update(source: string, data: DBStudio | DBRundownPlaylist[] | undefined): Promise<void> {
		const prevPlaylistsStatus = this._playlists
		const rundownPlaylists = data ? (data as DBRundownPlaylist[]) : []
		const studio = data ? (data as DBStudio) : undefined
		switch (source) {
			case StudioHandler.name:
				this._logger.info(`${this._name} received studio update ${studio?._id}`)
				this._studio = studio
				break
			case PlaylistsHandler.name:
				this._logger.info(`${this._name} received playlists update from ${source}`)
				this._playlists = rundownPlaylists.map((p) => {
					let activationStatus: PlaylistActivationStatus =
						p.activationId === undefined ? 'deactivated' : 'activated'
					if (p.activationId && p.rehearsal) activationStatus = 'rehearsal'
					return literal<PlaylistStatus>({
						id: unprotectString(p._id),
						name: p.name,
						activationStatus: activationStatus,
					})
				})
				break
			default:
				throw new Error(`${this._name} received unsupported update from ${source}}`)
		}

		const sameStatus =
			this._playlists.length === prevPlaylistsStatus.length &&
			this._playlists.reduce(
				(same, status, i) =>
					same &&
					!!prevPlaylistsStatus[i] &&
					status.id === prevPlaylistsStatus[i].id &&
					status.activationStatus === prevPlaylistsStatus[i].activationStatus,
				true
			)
		if (!sameStatus) this.sendStatus(this._subscribers)
	}
}
