import { Meteor } from 'meteor/meteor'
import * as _ from 'underscore'
import { check } from '../../lib/check'
import { Rundowns, Rundown, RundownId } from '../../lib/collections/Rundowns'
import { Segments, SegmentId } from '../../lib/collections/Segments'
import { unprotectString, makePromise, normalizeArray } from '../../lib/lib'
import { logger } from '../logging'
import { registerClassToMeteorMethods } from '../methods'
import { NewRundownAPI, RundownAPIMethods, RundownPlaylistValidateBlueprintConfigResult } from '../../lib/api/rundown'
import { ShowStyleVariants } from '../../lib/collections/ShowStyleVariants'
import { ShowStyleBases } from '../../lib/collections/ShowStyleBases'
import { Blueprints } from '../../lib/collections/Blueprints'
import { Studios } from '../../lib/collections/Studios'
import { PackageInfo } from '../coreSystem'
import { IngestActions } from './ingest/actions'
import { RundownPlaylistId } from '../../lib/collections/RundownPlaylists'
import { ReloadRundownPlaylistResponse, TriggerReloadDataResponse } from '../../lib/api/userActions'
import { MethodContextAPI, MethodContext } from '../../lib/api/methods'
import { StudioContentWriteAccess } from '../security/studio'
import { RundownPlaylistContentWriteAccess } from '../security/rundownPlaylist'
import { findMissingConfigs } from './blueprints/config'
import { rundownContentAllowWrite } from '../security/rundown'
import { runIngestOperation } from './ingest/lib'
import { createShowStyleCompound } from './showStyles'
import { IngestJobs } from '@sofie-automation/corelib/dist/worker/ingest'
import { triggerWriteAccessBecauseNoCheckNecessary } from '../security/lib/securityVerify'

export namespace ServerRundownAPI {
	/** Remove an individual rundown */
	export async function removeRundown(context: MethodContext, rundownId: RundownId): Promise<void> {
		check(rundownId, String)
		const access = RundownPlaylistContentWriteAccess.rundown(context, rundownId)

		await runIngestOperation(access.rundown.studioId, IngestJobs.UserRemoveRundown, {
			rundownId: rundownId,
			force: true,
		})
	}

	export async function unsyncRundown(context: MethodContext, rundownId: RundownId): Promise<void> {
		check(rundownId, String)
		const access = RundownPlaylistContentWriteAccess.rundown(context, rundownId)

		await runIngestOperation(access.rundown.studioId, IngestJobs.UserUnsyncRundown, {
			rundownId: rundownId,
		})
	}
	/** Resync all rundowns in a rundownPlaylist */
	export function resyncRundownPlaylist(
		context: MethodContext,
		playlistId: RundownPlaylistId
	): ReloadRundownPlaylistResponse {
		check(playlistId, String)
		const access = StudioContentWriteAccess.rundownPlaylist(context, playlistId)
		logger.info('resyncRundownPlaylist ' + access.playlist._id)

		const response: ReloadRundownPlaylistResponse = {
			rundownsResponses: Rundowns.find({ playlistId: access.playlist._id })
				.fetch()
				.map((rundown) => {
					return {
						rundownId: rundown._id,
						response: innerResyncRundown(rundown),
					}
				}),
		}
		return response
	}
	export function resyncRundown(context: MethodContext, rundownId: RundownId): TriggerReloadDataResponse {
		check(rundownId, String)
		const access = RundownPlaylistContentWriteAccess.rundown(context, rundownId)
		return innerResyncRundown(access.rundown)
	}

	export function resyncSegment(
		context: MethodContext,
		rundownId: RundownId,
		segmentId: SegmentId
	): TriggerReloadDataResponse {
		check(segmentId, String)
		rundownContentAllowWrite(context.userId, { rundownId })
		logger.info('resyncSegment ' + segmentId)
		const segment = Segments.findOne(segmentId)
		if (!segment) throw new Meteor.Error(404, `Segment "${segmentId}" not found!`)

		const rundown = Rundowns.findOne({ _id: segment.rundownId })
		if (!rundown) throw new Meteor.Error(404, `Rundown "${segment.rundownId}" not found!`)

		// Orphaned flag will be reset by the response update
		return IngestActions.reloadSegment(rundown, segment)
	}

	export function innerResyncRundown(rundown: Rundown): TriggerReloadDataResponse {
		logger.info('resyncRundown ' + rundown._id)

		// if (rundown.active) throw new Meteor.Error(400,`Not allowed to resync an active Rundown "${rundownId}".`)

		// Orphaned flag will be reset by the response update
		return IngestActions.reloadRundown(rundown)
	}
}
export namespace ClientRundownAPI {
	export function rundownPlaylistNeedsResync(context: MethodContext, playlistId: RundownPlaylistId): string[] {
		check(playlistId, String)
		const access = StudioContentWriteAccess.rundownPlaylist(context, playlistId)
		const playlist = access.playlist

		const rundowns = playlist.getRundowns()
		const errors = rundowns.map((rundown) => {
			if (!rundown.importVersions) return 'unknown'

			if (rundown.importVersions.core !== (PackageInfo.versionExtended || PackageInfo.version))
				return 'coreVersion'

			const showStyleVariant = ShowStyleVariants.findOne(rundown.showStyleVariantId)
			if (!showStyleVariant) return 'missing showStyleVariant'
			if (rundown.importVersions.showStyleVariant !== (showStyleVariant._rundownVersionHash || 0))
				return 'showStyleVariant'

			const showStyleBase = ShowStyleBases.findOne(rundown.showStyleBaseId)
			if (!showStyleBase) return 'missing showStyleBase'
			if (rundown.importVersions.showStyleBase !== (showStyleBase._rundownVersionHash || 0))
				return 'showStyleBase'

			const blueprint = Blueprints.findOne(showStyleBase.blueprintId)
			if (!blueprint) return 'missing blueprint'
			if (rundown.importVersions.blueprint !== (blueprint.blueprintVersion || 0)) return 'blueprint'

			const studio = Studios.findOne(rundown.studioId)
			if (!studio) return 'missing studio'
			if (rundown.importVersions.studio !== (studio._rundownVersionHash || 0)) return 'studio'
		})

		return _.compact(errors)
	}
	// Validate the blueprint config used for this rundown, to ensure that all the required fields are specified
	export async function rundownPlaylistValidateBlueprintConfig(
		context: MethodContext,
		playlistId: RundownPlaylistId
	): Promise<RundownPlaylistValidateBlueprintConfigResult> {
		check(playlistId, String)

		const access = StudioContentWriteAccess.rundownPlaylist(context, playlistId)
		const rundownPlaylist = access.playlist

		const studio = rundownPlaylist.getStudio()
		const studioBlueprint = studio.blueprintId ? await Blueprints.findOneAsync(studio.blueprintId) : null
		if (!studioBlueprint) throw new Meteor.Error(404, `Studio blueprint "${studio.blueprintId}" not found!`)

		const rundowns = rundownPlaylist.getRundowns()
		const uniqueShowStyleCompounds = _.uniq(
			rundowns,
			undefined,
			(rundown) => `${rundown.showStyleBaseId}-${rundown.showStyleVariantId}`
		)

		// Load all variants/compounds
		const [showStyleBases, showStyleVariants] = await Promise.all([
			ShowStyleBases.findFetchAsync({
				_id: { $in: uniqueShowStyleCompounds.map((r) => r.showStyleBaseId) },
			}),
			ShowStyleVariants.findFetchAsync({
				_id: { $in: uniqueShowStyleCompounds.map((r) => r.showStyleVariantId) },
			}),
		])
		const showStyleBlueprints = await Blueprints.findFetchAsync({
			_id: { $in: _.uniq(_.compact(showStyleBases.map((c) => c.blueprintId))) },
		})

		const showStyleBasesMap = normalizeArray(showStyleBases, '_id')
		const showStyleVariantsMap = normalizeArray(showStyleVariants, '_id')
		const showStyleBlueprintsMap = normalizeArray(showStyleBlueprints, '_id')

		const showStyleWarnings: RundownPlaylistValidateBlueprintConfigResult['showStyles'] =
			uniqueShowStyleCompounds.map((rundown) => {
				const showStyleBase = showStyleBasesMap[unprotectString(rundown.showStyleBaseId)]
				const showStyleVariant = showStyleVariantsMap[unprotectString(rundown.showStyleVariantId)]
				const id = `${rundown.showStyleBaseId}-${rundown.showStyleVariantId}`
				if (!showStyleBase || !showStyleVariant) {
					return {
						id: id,
						name: `${showStyleBase ? showStyleBase.name : rundown.showStyleBaseId}-${
							rundown.showStyleVariantId
						}`,
						checkFailed: true,
						fields: [],
					}
				}

				const compound = createShowStyleCompound(showStyleBase, showStyleVariant)
				if (!compound) {
					return {
						id: id,
						name: `${showStyleBase ? showStyleBase.name : rundown.showStyleBaseId}-${
							rundown.showStyleVariantId
						}`,
						checkFailed: true,
						fields: [],
					}
				}

				const blueprint = showStyleBlueprintsMap[unprotectString(compound.blueprintId)]
				if (!blueprint) {
					return {
						id: id,
						name: compound.name,
						checkFailed: true,
						fields: [],
					}
				} else {
					return {
						id: id,
						name: compound.name,
						checkFailed: false,
						fields: findMissingConfigs(blueprint.showStyleConfigManifest, compound.blueprintConfig),
					}
				}
			})

		return {
			studio: findMissingConfigs(studioBlueprint.studioConfigManifest, studio.blueprintConfig),
			showStyles: showStyleWarnings,
		}
	}
}

class ServerRundownAPIClass extends MethodContextAPI implements NewRundownAPI {
	async removeRundownPlaylist(_playlistId: RundownPlaylistId) {
		triggerWriteAccessBecauseNoCheckNecessary()

		throw new Error('Removed')
	}
	async resyncRundownPlaylist(playlistId: RundownPlaylistId) {
		return makePromise(() => ServerRundownAPI.resyncRundownPlaylist(this, playlistId))
	}
	async rundownPlaylistNeedsResync(playlistId: RundownPlaylistId) {
		return makePromise(() => ClientRundownAPI.rundownPlaylistNeedsResync(this, playlistId))
	}
	async rundownPlaylistValidateBlueprintConfig(playlistId: RundownPlaylistId) {
		return ClientRundownAPI.rundownPlaylistValidateBlueprintConfig(this, playlistId)
	}
	async removeRundown(rundownId: RundownId) {
		return ServerRundownAPI.removeRundown(this, rundownId)
	}
	async resyncRundown(rundownId: RundownId) {
		return makePromise(() => ServerRundownAPI.resyncRundown(this, rundownId))
	}
	async resyncSegment(rundownId: RundownId, segmentId: SegmentId) {
		return makePromise(() => ServerRundownAPI.resyncSegment(this, rundownId, segmentId))
	}
	async unsyncRundown(rundownId: RundownId) {
		return ServerRundownAPI.unsyncRundown(this, rundownId)
	}
	async moveRundown(
		_rundownId: RundownId,
		_intoPlaylistId: RundownPlaylistId | null,
		_rundownsIdsInPlaylistInOrder: RundownId[]
	) {
		triggerWriteAccessBecauseNoCheckNecessary()

		throw new Error('Removed')
	}
	async restoreRundownsInPlaylistToDefaultOrder(_playlistId: RundownPlaylistId) {
		triggerWriteAccessBecauseNoCheckNecessary()

		throw new Error('Removed')
	}
}
registerClassToMeteorMethods(RundownAPIMethods, ServerRundownAPIClass, false)
