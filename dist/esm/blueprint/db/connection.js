import { Database } from '#db/sqlite.js';
import { runMigrations } from './migrations/run.js';
export function openDb(dbPath) {
    const db = new Database(dbPath);
    db.exec('PRAGMA journal_mode = WAL');
    db.exec('PRAGMA foreign_keys = ON');
    runMigrations(db);
    return {
        db,
        close: () => db.close(),
    };
}
export function preparedQuery(db, sql) {
    return db.prepare(sql);
}
//# sourceMappingURL=connection.js.map