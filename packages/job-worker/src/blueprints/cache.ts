import { BlueprintId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import {
	ShowStyleBlueprintManifest,
	SomeBlueprintManifest,
	StudioBlueprintManifest,
	SystemBlueprintManifest,
} from '@sofie-automation/blueprints-integration'
import { VM, VMScript } from 'vm2'
import { ReadonlyDeep } from 'type-fest'
import { stringifyError } from '@sofie-automation/shared-lib/dist/lib/stringifyError'
import { Blueprint } from '@sofie-automation/corelib/dist/dataModel/Blueprint'
import fetch from 'node-fetch'

export interface WrappedSystemBlueprint {
	blueprintId: BlueprintId
	blueprint: SystemBlueprintManifest
}
export interface WrappedStudioBlueprint {
	blueprintDoc: Blueprint | undefined
	blueprintId: BlueprintId
	blueprint: StudioBlueprintManifest
}
export interface WrappedShowStyleBlueprint {
	blueprintId: BlueprintId
	blueprint: ShowStyleBlueprintManifest
}

// export async function loadSystemBlueprints(system: ICoreSystem): Promise<WrappedSystemBlueprint | undefined> {
// 	if (!system.blueprintId) return undefined

// 	const blueprintManifest = await loadBlueprintById(system.blueprintId)
// 	if (!blueprintManifest) throw new Error(`Blueprint "${system.blueprintId}" not found! (referenced by CoreSystem)`)

// 	if (blueprintManifest.blueprintType !== BlueprintManifestType.SYSTEM) {
// 		throw new Error(
// 			`Blueprint "${system.blueprintId}" is not valid for a CoreSystem (${blueprintManifest.blueprintType})!`
// 		)
// 	}

// 	return {
// 		blueprintId: system.blueprintId,
// 		blueprint: blueprintManifest,
// 	}
// }

/**
 * Parse a Blueprint document into executable code
 */
export async function parseBlueprintDocument(
	blueprint: Blueprint | undefined
): Promise<ReadonlyDeep<SomeBlueprintManifest> | undefined> {
	if (!blueprint) return undefined

	if (blueprint.code) {
		let manifest: SomeBlueprintManifest
		try {
			const vm = new VM({
				sandbox: {
					fetch: fetch, // Future: This should be removed once node18 native fetch is available
				},
			})

			const blueprintPath = `db:///blueprint/${blueprint.name || blueprint._id}-bundle.js`
			const script = new VMScript(
				`__run_result = ${blueprint.code}
__run_result || blueprint`,
				blueprintPath
			)
			// Future: we should look at freezing the object inside the vm
			const entry = vm.run(script)
			manifest = entry.default
		} catch (e) {
			throw new Error(`Syntax error in blueprint "${blueprint._id}": ${stringifyError(e)}`)
		}
		if (manifest.blueprintType !== blueprint.blueprintType) {
			throw new Error(
				`Evaluated Blueprint-manifest and document does not have the same blueprintType ("${manifest.blueprintType}", "${blueprint.blueprintType}")!`
			)
		}
		return manifest
	} else {
		throw new Error(`Blueprint "${blueprint._id}".code not set!`)
	}
}
