import { PieceLifespan } from '@sofie-automation/shared-lib/dist/core/model/Rundown';
import type { PieceAbSessionInfo } from '../abPlayback';
import type { ActionUserData } from '../action';
import type { SomeContent, WithTimeline } from '../content';
import type { ExpectedPackage } from '../package';
import type { ExpectedPlayoutItemGeneric } from './expectedPlayoutItem';
export { PieceLifespan };
export declare enum PieceTransitionType {
    MIX = "MIX",
    WIPE = "WIPE"
}
export interface PieceTransition {
    type: PieceTransitionType;
    duration: number;
}
export declare enum IBlueprintDirectPlayType {
    AdLibPiece = "adlib",
    AdLibAction = "action"
}
export interface IBlueprintDirectPlayBase {
    type: IBlueprintDirectPlayType;
}
export interface IBlueprintDirectPlayAdLibPiece extends IBlueprintDirectPlayBase {
    type: IBlueprintDirectPlayType.AdLibPiece;
}
export interface IBlueprintDirectPlayAdLibAction extends IBlueprintDirectPlayBase {
    type: IBlueprintDirectPlayType.AdLibAction;
    /** Id of the action */
    actionId: string;
    /** Properties defining the action behaviour */
    userData: ActionUserData;
}
export type IBlueprintDirectPlay = IBlueprintDirectPlayAdLibPiece | IBlueprintDirectPlayAdLibAction;
export interface IBlueprintPieceGeneric<TPrivateData = unknown, TPublicData = unknown> {
    /**
     * An identifier for this Piece
     * It should be unique within the part it belongs to, and consistent across ingest updates
     */
    externalId: string;
    /** User-presentable name for the timeline item */
    name: string;
    /** Arbitraty data storage for internal use in the blueprints */
    privateData?: TPrivateData;
    /** Arbitraty data relevant for other systems, made available to them through APIs */
    publicData?: TPublicData;
    /** Whether and how the piece is infinite */
    lifespan: PieceLifespan;
    /** Source layer the timeline item belongs to */
    sourceLayerId: string;
    /** Layer output this piece belongs to */
    outputLayerId: string;
    /** The object describing the item in detail */
    content: WithTimeline<SomeContent>;
    /** The transition used by this piece to transition to and from the piece */
    /** @deprecated */
    transitions?: {
        /** In transition for the piece */
        inTransition?: PieceTransition;
        /** The out transition for the piece */
        outTransition?: PieceTransition;
    };
    /**
     * How long this piece needs to prepare its content before it will have an effect on the output.
     * This allows for flows such as starting a clip playing, then cutting to it after some ms once the player is outputting frames.
     */
    prerollDuration?: number;
    /**
     * How long this piece needs to continue it's content after a take has been done to ensure a
     * seemless transition into the next part.
     */
    postrollDuration?: number;
    /** Whether the adlib should always be inserted queued */
    toBeQueued?: boolean;
    /** Array of items expected to be played out. This is used by playout-devices to preload stuff.
     * @deprecated replaced by .expectedPackages
     */
    expectedPlayoutItems?: ExpectedPlayoutItemGeneric[];
    /** User-defined tags that can be used for filtering adlibs in the shelf and identifying pieces by actions */
    tags?: string[];
    /** Allow this part to be direct played (eg, by double clicking in the rundown timeline view) */
    allowDirectPlay?: IBlueprintDirectPlay;
    /**
     * An array of which Packages this Piece uses. This is used by a Package Manager to ensure that the Package is in place for playout.
     * @todo
     */
    expectedPackages?: ExpectedPackage.Any[];
    /** HACK: Some pieces have side effects on other pieces, and pruning them when they have finished playback will cause playout glitches. This will tell core to not always preserve it */
    hasSideEffects?: boolean;
    /**
     * AB playback sessions needed for this Piece
     */
    abSessions?: PieceAbSessionInfo[];
}
//# sourceMappingURL=pieceGeneric.d.ts.map