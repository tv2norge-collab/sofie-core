import type { IBlueprintConfig } from '../common';
import type { ReadonlyDeep } from 'type-fest';
import type { BlueprintConfigCoreConfig, BlueprintManifestBase, BlueprintManifestType, IConfigMessage } from './base';
import type { JSONSchema } from '@sofie-automation/shared-lib/dist/lib/JSONSchemaTypes';
import type { JSONBlob } from '@sofie-automation/shared-lib/dist/lib/JSONBlob';
import type { MigrationStepStudio } from '../migrations';
import type { ICommonContext, IStudioBaselineContext, IStudioUserContext } from '../context';
import type { IBlueprintShowStyleBase } from '../showStyle';
import type { ExtendedIngestRundown } from '../ingest';
import type { ExpectedPlayoutItemGeneric, IBlueprintResultRundownPlaylist, IBlueprintRundownDB } from '../documents';
import type { BlueprintMappings } from '../studio';
import type { TimelineObjectCoreExt, TSR } from '../timeline';
import type { ExpectedPackage } from '../package';
export interface StudioBlueprintManifest<TRawConfig = IBlueprintConfig, TProcessedConfig = unknown> extends BlueprintManifestBase {
    blueprintType: BlueprintManifestType.STUDIO;
    /** A list of config items this blueprint expects to be available on the Studio */
    studioConfigSchema: JSONBlob<JSONSchema>;
    /** A list of Migration steps related to a Studio */
    studioMigrations: MigrationStepStudio[];
    /** The config presets exposed by this blueprint */
    configPresets: Record<string, IStudioConfigPreset<TRawConfig>>;
    /** Translations connected to the studio (as stringified JSON) */
    translations?: string;
    /** Returns the items used to build the baseline (default state) of a studio, this is the baseline used when there's no active rundown */
    getBaseline: (context: IStudioBaselineContext) => BlueprintResultStudioBaseline;
    /** Returns the id of the show style to use for a rundown, return null to ignore that rundown */
    getShowStyleId: (context: IStudioUserContext, showStyles: ReadonlyDeep<Array<IBlueprintShowStyleBase>>, ingestRundown: ExtendedIngestRundown) => string | null;
    /** Returns information about the playlist this rundown is a part of, return null to not make it a part of a playlist */
    getRundownPlaylistInfo?: (context: IStudioUserContext, rundowns: IBlueprintRundownDB[], playlistExternalId: string) => BlueprintResultRundownPlaylist | null;
    /**
     * Validate the config passed to this blueprint
     * In this you should do various sanity checks of the config and return a list of messages to display to the user.
     * These messages do not stop `applyConfig` from being called.
     */
    validateConfig?: (context: ICommonContext, config: TRawConfig) => Array<IConfigMessage>;
    /**
     * Apply the config by generating the data to be saved into the db.
     * This should be written to give a predictable and stable result, it can be called with the same config multiple times
     */
    applyConfig?: (context: ICommonContext, config: TRawConfig, coreConfig: BlueprintConfigCoreConfig) => BlueprintResultApplyStudioConfig;
    /** Preprocess config before storing it by core to later be returned by context's getStudioConfig. If not provided, getStudioConfig will return unprocessed blueprint config */
    preprocessConfig?: (context: ICommonContext, config: TRawConfig, coreConfig: BlueprintConfigCoreConfig) => TProcessedConfig;
}
export interface BlueprintResultStudioBaseline {
    timelineObjects: TimelineObjectCoreExt<TSR.TSRTimelineContent>[];
    /** @deprecated */
    expectedPlayoutItems?: ExpectedPlayoutItemGeneric[];
    expectedPackages?: ExpectedPackage.Any[];
}
/** Key is the ID of the external ID of the Rundown, Value is the rank to be assigned */
export interface BlueprintResultOrderedRundowns {
    [rundownExternalId: string]: number;
}
export interface BlueprintResultRundownPlaylist {
    playlist: IBlueprintResultRundownPlaylist;
    /** Returns information about the order of rundowns in a playlist, null will use natural sorting on rundown name */
    order: BlueprintResultOrderedRundowns | null;
}
/**
 * Blueprint defined default values for various Studio configuration.
 * Note: The user is able to override values from these in the UI, as well as add their own entries and disable ones which are defined here
 */
export interface BlueprintResultApplyStudioConfig {
    /** Playout Mappings */
    mappings: BlueprintMappings;
    /** Playout-gateway subdevices */
    playoutDevices: Record<string, TSR.DeviceOptionsAny>;
    /** Ingest-gateway subdevices, the types here depend on the gateway you use */
    ingestDevices: Record<string, unknown>;
    /** Input-gateway subdevices */
    inputDevices: Record<string, unknown>;
}
export interface IStudioConfigPreset<TConfig = IBlueprintConfig> {
    name: string;
    config: TConfig;
}
//# sourceMappingURL=studio.d.ts.map