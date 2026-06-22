import { mkdirSync } from 'node:fs'
import path from 'node:path'

import { coldStartIfNeeded } from '#db/cold-start.js'
import { openDb } from '#db/connection.js'
import { ingestAll, type IngestResult } from '#db/ingester.js'
import { resolveBlueprintProjectionDbPath, withProjectionDbWriteLock } from '#db/paths.js'

import { recordProjectionMetadata } from './freshness.js'

export async function reIngestProjection(cwd: string): Promise<IngestResult> {
  const target = resolveBlueprintProjectionDbPath(cwd)
  return withProjectionDbWriteLock(cwd, async () => {
    mkdirSync(path.dirname(target), { recursive: true })
    const conn = openDb(target)
    try {
      const result = await ingestAll({ db: conn.db, cwd })
      recordProjectionMetadata({
        dbPath: target,
        cwd,
        ingestedAt: Date.now(),
      })
      return result
    } finally {
      conn.close()
    }
  })
}

export async function ensureProjectionReady(cwd: string): Promise<void> {
  await coldStartIfNeeded(cwd)
}
