/**
 * Unified SQLite adapter for agent-kit.
 *
 * Driver is selected lazily so Node's static ESM loader never resolves
 * `bun:sqlite` (which fails outside Bun). Under Bun → `bun:sqlite`; under
 * Node (vitest, CLI) → `better-sqlite3`.
 */
/** Statement interface with better-sqlite3-compatible generic order. */
export interface Statement<Params extends unknown[] = unknown[], ReturnType = Record<string, unknown>> {
    get(...params: Params): ReturnType | undefined | null;
    all(...params: Params): ReturnType[];
    run(...params: Params): {
        changes: number;
        lastInsertRowid: number | bigint;
    };
    finalize?(): void;
}
export interface DatabaseOptions {
    readonly?: boolean;
    create?: boolean;
    readwrite?: boolean;
}
export declare class Database {
    private readonly _db;
    constructor(filename: string, options?: DatabaseOptions);
    prepare<Params extends unknown[] = unknown[], ReturnType = Record<string, unknown>>(sql: string): Statement<Params, ReturnType>;
    exec(sql: string): void;
    close(): void;
    get inTransaction(): boolean;
    transaction<T>(fn: (...args: unknown[]) => T): (...args: unknown[]) => T;
}
//# sourceMappingURL=sqlite.d.ts.map