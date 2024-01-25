import { IngestRundown } from '@sofie-automation/shared-lib/dist/peripheralDevice/ingest';
import { IBlueprintRundownDBData } from './documents';
export { IngestPart, IngestPlaylist, IngestRundown, IngestSegment, IngestAdlib, } from '@sofie-automation/shared-lib/dist/peripheralDevice/ingest';
/** The IngesteRundown is extended with data from Core */
export interface ExtendedIngestRundown extends IngestRundown {
    coreData: IBlueprintRundownDBData | undefined;
}
//# sourceMappingURL=ingest.d.ts.map