import Database from 'better-sqlite3';
import type { RunnerEvent } from '#runners/types';
export interface IngestOptions {
    readonly db: Database.Database;
    readonly cwd: string;
    readonly dryRun?: boolean;
}
export interface IngestResult {
    readonly blueprintsIngested: number;
    readonly techDebtIngested: number;
    readonly durationMs: number;
    readonly errors: string[];
}
export declare function ingestBlueprints(opts: IngestOptions): Promise<IngestResult>;
export declare function ingestTechDebt(opts: IngestOptions): Promise<IngestResult>;
export declare function ingestAll(opts: IngestOptions): Promise<IngestResult>;
export interface IngestRunnerEventInput {
    readonly db: Database.Database;
    readonly executionHandle: string;
    readonly sequence: number;
    readonly event: RunnerEvent;
    readonly runnerVersion: string;
}
export declare function ingestRunnerEvent(input: IngestRunnerEventInput): void;
//# sourceMappingURL=ingester.d.ts.map