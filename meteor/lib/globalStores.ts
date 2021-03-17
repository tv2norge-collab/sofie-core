import { ExpectedPackageId } from './collections/ExpectedPackages'
import {
	PackageContainerId,
	PackageContainerPackageStatusDB,
	getPackageContainerPackageId,
	PackageContainerPackageStatuses,
} from './collections/PackageContainerPackageStatus'
import { StudioId } from './collections/Studios'
import { ReactiveStore } from './ReactiveStore'

const storePackageContainerPackageStatuses = new ReactiveStore<
	PackageContainerId,
	PackageContainerPackageStatusDB | undefined
>({
	delayUpdateTime: 1000, // delay and batch updates
})
export const getPackageContainerPackageStatus = (
	studioId: StudioId,
	packageContainerId: string,
	expectedPackageId: string
) => {
	const id = getPackageContainerPackageId(studioId, packageContainerId, expectedPackageId)

	return storePackageContainerPackageStatuses.getValue(id, () => {
		return PackageContainerPackageStatuses.findOne({
			_id: id,
		})
	})
}
