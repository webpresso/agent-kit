import { execSync } from 'node:child_process';
export interface DbBuildResult {
    readonly durationMs: number;
    readonly blueprintsCount: number;
    readonly techDebtCount: number;
    readonly dbPath: string;
}
export interface DbVerifyResult {
    readonly ok: boolean;
    readonly blueprintsCount: number;
    readonly techDebtCount: number;
    readonly staleEntries: readonly StaleEntry[];
    readonly dbPath: string;
}
export interface StaleEntry {
    readonly table: 'blueprints' | 'tech_debt_items';
    readonly slug: string;
    readonly filePath: string;
}
export interface DbQueryResult {
    readonly rows: unknown[];
    readonly capped: boolean;
    readonly rowCount: number;
    readonly templateId: string;
}
/**
 * Always rebuilds `.agent/.blueprints.db` from all markdown files.
 * Never deletes the DB — always calls ingestAll on a fresh connection.
 */
export declare function dbBuild(projectRoot: string): Promise<DbBuildResult>;
/**
 * Checks that `.agent/.blueprints.db` is consistent with the markdown files
 * on disk by re-hashing each known file and comparing with the stored hash.
 */
export declare function dbVerify(projectRoot: string): Promise<DbVerifyResult>;
/**
 * Runs a pre-registered SQL template and returns its rows.
 * Ensures the DB exists via coldStartIfNeeded before querying.
 */
export declare function dbQuery(projectRoot: string, templateId: string, params?: Record<string, unknown>): Promise<DbQueryResult>;
export type ExecSyncFn = typeof execSync;
/**
 * Generates a minimal datasette metadata JSON and launches datasette
 * to serve `.agent/.blueprints.db` as an interactive web UI.
 *
 * Prints a clear error and exits 1 if datasette is not installed.
 *
 * The optional `_execSync` parameter is injectable for testing — callers
 * should omit it in production.
 */
export declare function dbBrowse(projectRoot: string, _execSync?: ExecSyncFn): void;
export declare function formatDbBuildResult(result: DbBuildResult): string;
export declare function formatDbVerifyResult(result: DbVerifyResult): string;
export declare function executeBlueprintDbSubcommand(verb: string | undefined, args: readonly string[], options: {
    readonly params?: string;
    readonly projectRoot?: string;
    readonly json?: boolean;
}, print: (value: object | string, asJson?: boolean) => void): Promise<void>;
//# sourceMappingURL=db-commands.d.ts.map