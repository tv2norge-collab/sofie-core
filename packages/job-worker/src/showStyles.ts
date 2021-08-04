import { DBShowStyleBase, ShowStyleCompound } from '@sofie-automation/corelib/dist/dataModel/ShowStyleBase'
import { DBShowStyleVariant } from '@sofie-automation/corelib/dist/dataModel/ShowStyleVariant'
import * as deepmerge from 'deepmerge'

export function createShowStyleCompound(
	showStyleBase: DBShowStyleBase,
	showStyleVariant: DBShowStyleVariant
): ShowStyleCompound | undefined {
	if (showStyleBase._id !== showStyleVariant.showStyleBaseId) return undefined

	const configs = deepmerge(showStyleBase.blueprintConfig, showStyleVariant.blueprintConfig, {
		arrayMerge: (_destinationArray, sourceArray, _options) => sourceArray,
	})

	return {
		...showStyleBase,
		showStyleVariantId: showStyleVariant._id,
		name: `${showStyleBase.name}-${showStyleVariant.name}`,
		blueprintConfig: configs,
		_rundownVersionHash: showStyleBase._rundownVersionHash,
		_rundownVersionHashVariant: showStyleVariant._rundownVersionHash,
	}
}
