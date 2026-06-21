export interface NativeSearchHit {
    readonly content: string;
    readonly source: string;
    readonly rank: number;
    readonly tier: 'porter' | 'trigram' | 'levenshtein' | string;
}
export interface NativeSnapshotResult {
    readonly snapshotId: string;
    readonly eventCount: number;
    readonly complete: boolean;
}
export interface NativeSessionEvent {
    readonly sessionId: string;
    readonly eventId: string;
    readonly ts: number;
    readonly toolName: string;
    readonly content: string;
}
export interface NativeExecuteResult {
    readonly exitCode: number;
    readonly outputBytes: number;
    readonly truncated?: boolean;
    readonly capturedBytes?: number;
    readonly maxCaptureBytes?: number;
    readonly timedOut?: boolean;
    readonly indexed: boolean;
    readonly summary: string;
}
export interface NativeSessionMemoryModule {
    readonly index: (dbPath: string, sourceLabel: string, payload: string, isHtml?: boolean) => number;
    readonly search: (dbPath: string, query: string, limit: number, sourceFilter?: string | null) => NativeSearchHit[];
    readonly captureEvent: (dbPath: string, repoHash: string, sessionId: string, eventId: string, toolName: string, content: string) => void;
    readonly flushEvents: () => number;
    readonly flushEventsForDb?: (dbPath: string) => number;
    readonly snapshot: (dbPath: string, repoHash: string, agentId: string, maxMs: number) => NativeSnapshotResult;
    readonly restore: (dbPath: string, repoHash: string, agentId: string, query: string, limit: number) => NativeSessionEvent[];
    readonly executeSandboxed: (dbPath: string, command: string, label: string, timeoutMs: number, cwd?: string | null) => Promise<NativeExecuteResult>;
}
export declare class NativeSessionMemoryUnavailableError extends Error {
    constructor(message: string);
}
export declare class NativeSessionMemoryLoadError extends Error {
    constructor(message: string, options?: {
        cause?: unknown;
    });
}
export declare function resetNativeSessionMemoryEngineForTests(): void;
export declare function loadNativeSessionMemoryEngine(): NativeSessionMemoryModule;
//# sourceMappingURL=native-runtime.d.ts.map