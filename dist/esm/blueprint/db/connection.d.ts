import { Database, type Statement } from "#db/sqlite.js";
export type DbConnection = {
    readonly db: Database;
    readonly close: () => void;
};
export declare function openDb(dbPath: string): DbConnection;
export declare function preparedQuery<T>(db: Database, sql: string): Statement<[], T>;
//# sourceMappingURL=connection.d.ts.map