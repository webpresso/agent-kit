import { createHash } from 'node:crypto'
import { execSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { coldStartIfNeeded } from '#db/cold-start.js'
import { openDb } from '#db/connection.js'
import { resolveBlueprintProjectionDbPath } from '#db/paths.js'
import { runTemplate } from '#db/template-runner.js'
import { reIngestProjection } from '#projection-ready.js'
import { writeJsonFileAtomic } from '#shared-utils/write-json-file.js'

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const METADATA_FILENAME = '.datasette-metadata.json'

function agentDbPath(projectRoot: string): string {
  return resolveBlueprintProjectionDbPath(projectRoot)
}

function agentMetadataPath(projectRoot: string): string {
  return path.join(path.dirname(agentDbPath(projectRoot)), METADATA_FILENAME)
}

// ---------------------------------------------------------------------------
// Result types
// ---------------------------------------------------------------------------

export interface DbBuildResult {
  readonly durationMs: number
  readonly blueprintsCount: number
  readonly techDebtCount: number
  readonly dbPath: string
}

export interface DbVerifyResult {
  readonly ok: boolean
  readonly blueprintsCount: number
  readonly techDebtCount: number
  readonly staleEntries: readonly StaleEntry[]
  readonly dbPath: string
}

export interface StaleEntry {
  readonly table: 'blueprints' | 'tech_debt_items'
  readonly slug: string
  readonly filePath: string
}

export interface DbQueryResult {
  readonly rows: unknown[]
  readonly capped: boolean
  readonly rowCount: number
  readonly templateId: string
}

// ---------------------------------------------------------------------------
// build
// ---------------------------------------------------------------------------

/**
 * Always rebuilds the canonical blueprint projection DB from all markdown
 * files. Delegates to `reIngestProjection` — the single owner of the persistent
 * reingest sequence (prune → write-lock → ingest → record freshness metadata) —
 * so `wp blueprint db build` refreshes the freshness sidecar and is a true
 * recovery for a stale (`reingest_project`) projection.
 */
export async function dbBuild(projectRoot: string): Promise<DbBuildResult> {
  const start = Date.now()
  const result = await reIngestProjection(projectRoot)

  return {
    durationMs: Date.now() - start,
    blueprintsCount: result.blueprintsIngested,
    techDebtCount: result.techDebtIngested,
    dbPath: agentDbPath(projectRoot),
  }
}

// ---------------------------------------------------------------------------
// verify
// ---------------------------------------------------------------------------

/**
 * Checks that the canonical blueprint projection DB is consistent with the
 * markdown files on disk by re-hashing each known file and comparing with the
 * stored hash.
 */
export async function dbVerify(projectRoot: string): Promise<DbVerifyResult> {
  const dbPath = agentDbPath(projectRoot)

  if (!existsSync(dbPath)) {
    throw new Error(`DB not found at ${dbPath}. Run \`wp blueprint db build\` first.`)
  }

  const conn = openDb(dbPath)
  const staleEntries: StaleEntry[] = []

  try {
    // --- blueprints ---
    const blueprintRows = conn.db
      .prepare<[], { slug: string; file_path: string; content_hash: string }>(
        'SELECT slug, file_path, content_hash FROM blueprints',
      )
      .all()

    for (const row of blueprintRows) {
      if (!existsSync(row.file_path)) {
        staleEntries.push({ table: 'blueprints', slug: row.slug, filePath: row.file_path })
        continue
      }
      const currentHash = createHash('sha256')
        .update(readFileSync(row.file_path, 'utf8'))
        .digest('hex')
      if (currentHash !== row.content_hash) {
        staleEntries.push({ table: 'blueprints', slug: row.slug, filePath: row.file_path })
      }
    }

    // --- tech_debt_items ---
    const techDebtRows = conn.db
      .prepare<[], { slug: string; file_path: string; content_hash: string }>(
        'SELECT slug, file_path, content_hash FROM tech_debt_items',
      )
      .all()

    for (const row of techDebtRows) {
      if (!existsSync(row.file_path)) {
        staleEntries.push({ table: 'tech_debt_items', slug: row.slug, filePath: row.file_path })
        continue
      }
      const currentHash = createHash('sha256')
        .update(readFileSync(row.file_path, 'utf8'))
        .digest('hex')
      if (currentHash !== row.content_hash) {
        staleEntries.push({ table: 'tech_debt_items', slug: row.slug, filePath: row.file_path })
      }
    }

    return {
      ok: staleEntries.length === 0,
      blueprintsCount: blueprintRows.length,
      techDebtCount: techDebtRows.length,
      staleEntries,
      dbPath,
    }
  } finally {
    conn.close()
  }
}

// ---------------------------------------------------------------------------
// query
// ---------------------------------------------------------------------------

/**
 * Runs a pre-registered SQL template and returns its rows.
 * Ensures the DB exists via coldStartIfNeeded before querying.
 */
export async function dbQuery(
  projectRoot: string,
  templateId: string,
  params: Record<string, unknown> = {},
): Promise<DbQueryResult> {
  await coldStartIfNeeded(projectRoot)

  const dbPath = agentDbPath(projectRoot)
  const conn = openDb(dbPath)

  try {
    const result = runTemplate(conn.db, templateId, params)
    return {
      rows: result.rows,
      capped: result.capped,
      rowCount: result.rowCount,
      templateId,
    }
  } finally {
    conn.close()
  }
}

// ---------------------------------------------------------------------------
// browse
// ---------------------------------------------------------------------------

export type ExecSyncFn = typeof execSync

/**
 * Generates a minimal datasette metadata JSON and launches datasette to serve
 * the canonical blueprint projection DB as an interactive web UI.
 *
 * Prints a clear error and exits 1 if datasette is not installed.
 *
 * The optional `_execSync` parameter is injectable for testing — callers
 * should omit it in production.
 */
export function dbBrowse(projectRoot: string, _execSync: ExecSyncFn = execSync): void {
  const dbPath = agentDbPath(projectRoot)
  const metadataPath = agentMetadataPath(projectRoot)
  const agentDir = path.dirname(dbPath)

  if (!existsSync(dbPath)) {
    process.stderr.write(`DB not found at ${dbPath}.\nRun \`wp blueprint db build\` first.\n`)
    process.exit(1)
  }

  // Check datasette availability
  try {
    _execSync('datasette --version', { stdio: 'pipe', timeout: 3_000 })
  } catch {
    process.stderr.write(
      'Datasette is not installed. Install it with:\n\n  pip install datasette\n\n',
    )
    process.exit(1)
  }

  // Write minimal datasette metadata
  mkdirSync(agentDir, { recursive: true })
  const metadata = {
    title: 'Blueprints DB',
    description: 'Blueprint and tech-debt structured store (webpresso)',
    source: 'wp blueprint db build',
  }
  writeJsonFileAtomic(metadataPath, metadata)

  // Launch datasette (blocking — inherits stdio so the user sees the URL)
  _execSync(`datasette serve "${dbPath}" --metadata "${metadataPath}"`, { stdio: 'inherit' })
}

// ---------------------------------------------------------------------------
// Format helpers (used by router-dispatch)
// ---------------------------------------------------------------------------

export function formatDbBuildResult(result: DbBuildResult): string {
  return `Rebuilt in ${result.durationMs}ms (${result.blueprintsCount} blueprints, ${result.techDebtCount} tech-debt items)`
}

export function formatDbVerifyResult(result: DbVerifyResult): string {
  if (result.ok) {
    return `OK (${result.blueprintsCount} blueprints, ${result.techDebtCount} tech-debt items)`
  }

  const lines: string[] = [`Stale entries (${result.staleEntries.length}):`]
  for (const entry of result.staleEntries) {
    lines.push(`  [${entry.table}] ${entry.slug} — ${entry.filePath}`)
  }
  return lines.join('\n')
}

// ---------------------------------------------------------------------------
// Dispatch helper — handles the `db` subcommand group
// ---------------------------------------------------------------------------

export async function executeBlueprintDbSubcommand(
  verb: string | undefined,
  args: readonly string[],
  options: {
    readonly params?: string
    readonly projectRoot?: string
    readonly json?: boolean
  },
  print: (value: object | string, asJson?: boolean) => void,
): Promise<void> {
  const projectRoot = options.projectRoot ?? process.cwd()

  switch (verb) {
    case 'build': {
      const result = await dbBuild(projectRoot)
      print(options.json ? result : formatDbBuildResult(result), options.json)
      return
    }
    case 'query': {
      const templateId = args[0]
      if (!templateId) {
        throw new Error('Usage: wp blueprint db query <template-id> [--params \'{"key":value}\']')
      }
      let params: Record<string, unknown> = {}
      if (options.params) {
        try {
          const parsed: unknown = JSON.parse(options.params)
          if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
            throw new Error('--params must be a JSON object')
          }
          params = parsed as Record<string, unknown>
        } catch (err) {
          throw new Error(
            `Invalid --params JSON: ${err instanceof Error ? err.message : String(err)}`,
          )
        }
      }
      const result = await dbQuery(projectRoot, templateId, params)
      print(options.json ? result : JSON.stringify(result.rows, null, 2), options.json)
      return
    }
    case 'verify': {
      const result = await dbVerify(projectRoot)
      print(options.json ? result : formatDbVerifyResult(result), options.json)
      if (!result.ok) {
        process.exitCode = 1
      }
      return
    }
    case 'browse': {
      // dbBrowse calls process.exit(1) on error — never throws
      dbBrowse(projectRoot)
      return
    }
    default: {
      throw new Error(
        `Unknown blueprint db verb: ${verb ?? '(none)'}\n\nUse one of: build, query, verify, browse`,
      )
    }
  }
}
