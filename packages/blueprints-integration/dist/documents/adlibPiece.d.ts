import type { IBlueprintPieceGeneric } from './pieceGeneric';
export interface IBlueprintAdLibPiece<TMetadata = unknown> extends IBlueprintPieceGeneric<TMetadata> {
    /** Used for sorting in the UI */
    _rank: number;
    /** When something bad has happened, we can mark the AdLib as invalid, which will prevent the user from TAKE:ing it */
    invalid?: boolean;
    /** Expected duration of the piece, in milliseconds */
    expectedDuration?: number;
    /** When the NRCS informs us that the producer marked the part as floated, we can prevent the user from TAKE'ing it, but still have it visible and allow manipulation */
    floated?: boolean;
    /** Piece tags to use to determine if action is currently active */
    currentPieceTags?: string[];
    /** Piece tags to use to determine if action is set as next */
    nextPieceTags?: string[];
    /**
     * String that can be used to identify adlibs that are equivalent to each other,
     * if there are multiple Adlibs with the same uniquenessId,
     * only one of them should be displayed in the GUI.
     */
    uniquenessId?: string;
    /** When not playing, display in the UI as playing, and vice versa. Useful for Adlibs that toggle something off when taken */
    invertOnAirState?: boolean;
}
/** The AdLib piece sent from Core */
export interface IBlueprintAdLibPieceDB<TMetadata = unknown> extends IBlueprintAdLibPiece<TMetadata> {
    _id: string;
}
//# sourceMappingURL=adlibPiece.d.ts.map