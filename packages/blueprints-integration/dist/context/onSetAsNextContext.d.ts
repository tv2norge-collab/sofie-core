import { IBlueprintMutatablePart, IBlueprintPart, IBlueprintPartInstance, IBlueprintPiece, IBlueprintPieceDB, IBlueprintPieceInstance, IBlueprintResolvedPieceInstance, IEventContext, IShowStyleUserContext } from '..';
/**
 * Context in which 'current' is the part currently on air, and 'next' is the partInstance being set as Next
 * This is similar to `IPartAndPieceActionContext`, but has more limits on what is allowed to be changed.
 */
export interface IOnSetAsNextContext extends IShowStyleUserContext, IEventContext {
    /**
     * Data fetching
     */
    /** Get a PartInstance which can be modified */
    getPartInstance(part: 'current' | 'next'): Promise<IBlueprintPartInstance | undefined>;
    /** Get the PieceInstances for a modifiable PartInstance */
    getPieceInstances(part: 'current' | 'next'): Promise<IBlueprintPieceInstance[]>;
    /** Get the resolved PieceInstances for a modifiable PartInstance */
    getResolvedPieceInstances(part: 'current' | 'next'): Promise<IBlueprintResolvedPieceInstance[]>;
    /** Get the last active piece on given layer */
    findLastPieceOnLayer(sourceLayerId: string | string[], options?: {
        excludeCurrentPart?: boolean;
        originalOnly?: boolean;
        piecePrivateDataFilter?: any;
    }): Promise<IBlueprintPieceInstance | undefined>;
    /** Get the previous scripted piece on a given layer, looking backwards from the current part. */
    findLastScriptedPieceOnLayer(sourceLayerId: string | string[], options?: {
        excludeCurrentPart?: boolean;
        piecePrivateDataFilter?: any;
    }): Promise<IBlueprintPiece | undefined>;
    /** Gets the PartInstance for a PieceInstance retrieved from findLastPieceOnLayer. This primarily allows for accessing metadata of the PartInstance */
    getPartInstanceForPreviousPiece(piece: IBlueprintPieceInstance): Promise<IBlueprintPartInstance>;
    /** Gets the Part for a Piece retrieved from findLastScriptedPieceOnLayer. This primarily allows for accessing metadata of the Part */
    getPartForPreviousPiece(piece: IBlueprintPieceDB): Promise<IBlueprintPart | undefined>;
    /**
     * Creative actions
     */
    /** Insert a pieceInstance. Returns id of new PieceInstance. Any timelineObjects will have their ids changed, so are not safe to reference from another piece */
    insertPiece(part: 'next', piece: IBlueprintPiece): Promise<IBlueprintPieceInstance>;
    /** Update a piecesInstance from the partInstance being set as Next */
    updatePieceInstance(pieceInstanceId: string, piece: Partial<IBlueprintPiece>): Promise<IBlueprintPieceInstance>;
    /** Update a partInstance */
    updatePartInstance(part: 'current' | 'next', props: Partial<IBlueprintMutatablePart>): Promise<IBlueprintPartInstance>;
    /**
     * Destructive actions
     */
    /** Remove piecesInstances by id. Returns ids of piecesInstances that were removed. Note: For now we only allow removing from the next, but this might change to include current if there is justification */
    removePieceInstances(part: 'next', pieceInstanceIds: string[]): Promise<string[]>;
}
//# sourceMappingURL=onSetAsNextContext.d.ts.map