import Database from 'better-sqlite3';
export type DbConnection = {
    readonly db: Database.Database;
    readonly close: () => void;
};
export declare function openDb(dbPath: string): DbConnection;
export declare function preparedQuery<T>(db: Database.Database, sql: string): Database.Statement<T[]>;
//# sourceMappingURL=connection.d.ts.map