import type { DatastorePersistenceMode, Time } from '../common';
import type { IEventContext } from '.';
import type { IShowStyleUserContext } from './showStyleContext';
import { IPartAndPieceActionContext } from './partsAndPieceActionContext';
import { IExecuteTSRActionsContext } from './executeTsrActionContext';
/** Actions */
export interface IDataStoreActionExecutionContext extends IShowStyleUserContext, IEventContext {
    /**
     * Setting a value in the datastore allows us to overwrite parts of a timeline content object with that value
     * @param key Key to use when referencing from the timeline object
     * @param value Value to overwrite the timeline object's content with
     * @param mode In temporary mode the value may be removed when the key is no longer on the timeline
     */
    setTimelineDatastoreValue(key: string, value: any, mode: DatastorePersistenceMode): Promise<void>;
    /** Deletes a previously set value from the datastore */
    removeTimelineDatastoreValue(key: string): Promise<void>;
}
export interface IActionExecutionContext extends IShowStyleUserContext, IEventContext, IDataStoreActionExecutionContext, IPartAndPieceActionContext, IExecuteTSRActionsContext {
    /** Fetch the showstyle config for the specified part */
    /** Move the next part through the rundown. Can move by either a number of parts, or segments in either direction. */
    moveNextPart(partDelta: number, segmentDelta: number): Promise<void>;
    /** Set flag to perform take after executing the current action. Returns state of the flag after each call. */
    takeAfterExecuteAction(take: boolean): Promise<boolean>;
    /** Inform core that a take out of the current partinstance should be blocked until the specified time */
    blockTakeUntil(time: Time | null): Promise<void>;
}
//# sourceMappingURL=adlibActionContext.d.ts.map