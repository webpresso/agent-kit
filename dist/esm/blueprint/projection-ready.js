import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { coldStartIfNeeded } from '#db/cold-start.js';
import { openDb } from '#db/connection.js';
import { ingestAll } from '#db/ingester.js';
import { resolveBlueprintProjectionDbPath, withProjectionDbWriteLock } from '#db/paths.js';
import { recordProjectionMetadata } from './freshness.js';
export async function reIngestProjection(cwd) {
    const target = resolveBlueprintProjectionDbPath(cwd);
    await withProjectionDbWriteLock(cwd, async () => {
        mkdirSync(path.dirname(target), { recursive: true });
        const conn = openDb(target);
        try {
            await ingestAll({ db: conn.db, cwd });
            recordProjectionMetadata({
                dbPath: target,
                cwd,
                ingestedAt: Date.now(),
            });
        }
        finally {
            conn.close();
        }
    });
}
export async function ensureProjectionReady(cwd) {
    await coldStartIfNeeded(cwd);
}
//# sourceMappingURL=projection-ready.js.map