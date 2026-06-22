import { existsSync, mkdirSync } from 'node:fs'
import path from 'node:path'

import { openDb } from './connection.js'
import { ingestAll } from './ingester.js'
import { resolveBlueprintProjectionDbPath, withProjectionDbWriteLock } from './paths.js'
import { recordProjectionMetadata } from '#freshness.js'

export interface ColdStartResult {
  rebuilt: boolean
  blueprintsCount: number
  techDebtCount: number
  durationMs: number
}

export async function coldStartIfNeeded(cwd: string): Promise<ColdStartResult> {
  const start = Date.now()

  const target = resolveBlueprintProjectionDbPath(cwd)
  if (existsSync(target)) {
    return { rebuilt: false, blueprintsCount: 0, techDebtCount: 0, durationMs: 0 }
  }

  // F9/R7: worktree-scoped write lock. Throws LockTimeoutError on failure —
  // no silent 5s "proceeds anyway" escape on write paths.
  return withProjectionDbWriteLock(cwd, async () => {
    // Re-check after lock acquisition — another writer may have created it.
    if (existsSync(target)) {
      return { rebuilt: false, blueprintsCount: 0, techDebtCount: 0, durationMs: 0 }
    }

    mkdirSync(path.dirname(target), { recursive: true })

    const conn = openDb(target)
    let blueprintsCount = 0
    let techDebtCount = 0

    try {
      const result = await ingestAll({ db: conn.db, cwd })
      blueprintsCount = result.blueprintsIngested
      techDebtCount = result.techDebtIngested
      recordProjectionMetadata({
        dbPath: target,
        cwd,
        ingestedAt: Date.now(),
      })
    } finally {
      conn.close()
    }

    const durationMs = Date.now() - start
    process.stderr.write(
      `[cold-start] Rebuilt in ${durationMs}ms (${blueprintsCount} blueprints, ${techDebtCount} tech-debt items)\n`,
    )

    return { rebuilt: true, blueprintsCount, techDebtCount, durationMs }
  })
}
