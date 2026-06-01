import type { RestoreInput, RestoredSessionEvent, SessionCaptureInput, SnapshotInput, SnapshotResult } from './types.js';
export declare class SessionMemorySessionStore {
    private readonly db;
    constructor(dbPath: string);
    close(): void;
    captureEvent(input: SessionCaptureInput): string;
    snapshot(input: SnapshotInput): SnapshotResult;
    restore(input: RestoreInput): RestoredSessionEvent[];
}
//# sourceMappingURL=session.d.ts.map