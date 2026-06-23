import type { RestoreInput, RestoredSessionEvent, SessionCaptureInput, SessionMemoryUnifiedResult, SnapshotInput, SnapshotResult } from './types.js';
export declare const SESSION_MEMORY_SCHEMA_VERSION = 2;
export interface SessionContinuityStats {
    eventCount: number;
    repoCount: number;
    sessionCount: number;
    snapshotCount: number;
}
export interface SessionContinuityPurgeOptions {
    repoHash?: string;
    sessionId?: string;
    confirm?: boolean;
    allowGlobal?: boolean;
}
export interface SessionContinuityPurgeResult {
    dryRun: boolean;
    matchedEventCount: number;
    deletedEventCount: number;
    matchedSnapshotCount: number;
    deletedSnapshotCount: number;
    warnings: string[];
}
export interface SessionContinuityDoctorResult {
    ok: boolean;
    eventCount: number;
    repoCount: number;
    sessionCount: number;
    snapshotCount: number;
    warnings: string[];
}
export declare class SessionMemorySessionStore {
    private readonly db;
    constructor(dbPath: string);
    close(): void;
    captureEvent(input: SessionCaptureInput): string;
    snapshot(input: SnapshotInput): SnapshotResult;
    restore(input: RestoreInput): RestoredSessionEvent[];
    stats(): SessionContinuityStats;
    purge(options?: SessionContinuityPurgeOptions): SessionContinuityPurgeResult;
    doctor(): SessionContinuityDoctorResult;
    restoreUnified(input: RestoreInput): SessionMemoryUnifiedResult[];
    private tableExists;
    private tableColumns;
    private userVersion;
    private migrateLegacySchema;
    private migrateLegacySessionsSchema;
    private migrateLegacySessionEventsSchema;
    private ensureCurrentSchema;
    private assertCurrentSchemaInTransaction;
    private rebuildFtsInTransaction;
}
//# sourceMappingURL=session.d.ts.map