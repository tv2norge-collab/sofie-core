import { PartId } from '@sofie-automation/corelib/dist/dataModel/Ids'
import { ReadonlyDeep } from 'type-fest'
import { DBSegment, SegmentOrphanedReason } from '@sofie-automation/corelib/dist/dataModel/Segment'
import { DBPart } from '@sofie-automation/corelib/dist/dataModel/Part'
import { SegmentWithParts } from '../SegmentWithParts'

export class SegmentWithPartsImpl implements SegmentWithParts {
	readonly #Segment: DBSegment
	readonly Parts: ReadonlyDeep<DBPart[]>

	get Segment(): ReadonlyDeep<DBSegment> {
		return this.#Segment
	}

	constructor(segment: DBSegment, parts: DBPart[]) {
		parts.sort((a, b) => a._rank - b._rank) // nocommit - check order

		this.#Segment = segment
		this.Parts = parts
	}

	getPartIds(): PartId[] {
		return this.Parts.map((part) => part._id)
	}

	getPart(id: PartId): ReadonlyDeep<DBPart> | undefined {
		return this.Parts.find((part) => part._id === id)
	}

	// Internal mutation hack
	setScratchpadRank(rank: number): void {
		if (this.#Segment.orphaned !== SegmentOrphanedReason.SCRATCHPAD)
			throw new Error('setScratchpadRank can only be used on a SCRATCHPAD segment')

		this.#Segment._rank = rank
	}
}
