import { existsSync, mkdirSync, openSync, closeSync, constants } from 'node:fs';
import path from 'node:path';
import { openDb } from './connection.js';
import { ingestAll } from './ingester.js';
const DB_FILENAME = '.blueprints.db';
const LOCK_FILENAME = '.blueprints.lock';
function dbPath(cwd) {
    return path.join(cwd, '.agent', DB_FILENAME);
}
function lockPath(cwd) {
    return path.join(cwd, '.agent', LOCK_FILENAME);
}
/** Advisory lock using an exclusive open on the lock file.
 *  Returns a release function. If the lock is already held, waits up to
 *  5 seconds in 50ms increments, then proceeds anyway (advisory only). */
async function acquireLock(lockFile) {
    const dir = path.dirname(lockFile);
    mkdirSync(dir, { recursive: true });
    const maxWaitMs = 5_000;
    const intervalMs = 50;
    const deadline = Date.now() + maxWaitMs;
    let fd = null;
    while (Date.now() < deadline) {
        try {
            fd = openSync(lockFile, constants.O_WRONLY | constants.O_CREAT | constants.O_EXCL, 0o600);
            break;
        }
        catch {
            await new Promise((resolve) => setTimeout(resolve, intervalMs));
        }
    }
    if (fd === null) {
        // Advisory: could not acquire — proceed without lock
        return () => {
            /* no-op */
        };
    }
    closeSync(fd);
    const { unlinkSync } = await import('node:fs');
    return () => {
        try {
            unlinkSync(lockFile);
        }
        catch {
            /* already gone */
        }
    };
}
export async function coldStartIfNeeded(cwd) {
    const start = Date.now();
    const target = dbPath(cwd);
    const lock = lockPath(cwd);
    if (existsSync(target)) {
        return { rebuilt: false, blueprintsCount: 0, techDebtCount: 0, durationMs: 0 };
    }
    const release = await acquireLock(lock);
    try {
        // Re-check after lock acquisition — another process may have created it
        if (existsSync(target)) {
            return { rebuilt: false, blueprintsCount: 0, techDebtCount: 0, durationMs: 0 };
        }
        const agentDir = path.dirname(target);
        mkdirSync(agentDir, { recursive: true });
        const conn = openDb(target);
        let blueprintsCount = 0;
        let techDebtCount = 0;
        try {
            const result = await ingestAll({ db: conn.db, cwd });
            blueprintsCount = result.blueprintsIngested;
            techDebtCount = result.techDebtIngested;
        }
        finally {
            conn.close();
        }
        const durationMs = Date.now() - start;
        process.stderr.write(`[cold-start] Rebuilt in ${durationMs}ms (${blueprintsCount} blueprints, ${techDebtCount} tech-debt items)\n`);
        return { rebuilt: true, blueprintsCount, techDebtCount, durationMs };
    }
    finally {
        release();
    }
}
//# sourceMappingURL=cold-start.js.map