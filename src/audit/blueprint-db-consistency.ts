/**
 * `wp audit blueprint-db-consistency` — SQL-backed consistency check between
 * the SQLite blueprints DB and the filesystem.
 *
 * Alpha gate: only runs meaningful checks when WP_USE_SQL_AUDITS=1.
 * Without the flag returns a disabled notice (pass: true).
 *
 * Checks (when enabled):
 * 1. Every `blueprints` row's `file_path` actually exists on disk.
 * 2. Every canonical blueprint markdown file on disk has a corresponding DB row.
 * 3. `content_hash` in DB matches the current SHA-256 of the file content.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'

import { scanBlueprintDirectory } from '#service/scanner.js'

import type { RepoAuditResult, RepoAuditViolation } from './repo-guardrails.js'

const DB_PATH = path.join('.agent', '.blueprints.db')
const _DISABLED_RESULT: RepoAuditResult = {
  ok: true,
  title: 'Blueprint DB consistency (SQL)',
  checked: 0,
  violations: [],
  // message is not part of RepoAuditResult — surface it in the title instead
} satisfies RepoAuditResult

function computeSha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

interface BlueprintRow {
  slug: string
  file_path: string
  content_hash: string
}

export async function auditBlueprintDbConsistency(cwd: string): Promise<RepoAuditResult> {
  if (!process.env['WP_USE_SQL_AUDITS']) {
    return {
      ok: true,
      title: 'Blueprint DB consistency (SQL) — disabled (set WP_USE_SQL_AUDITS=1)',
      checked: 0,
      violations: [],
    }
  }

  const dbFile = path.join(cwd, DB_PATH)
  if (!existsSync(dbFile)) {
    return {
      ok: true,
      title: 'Blueprint DB consistency (SQL)',
      checked: 0,
      violations: [],
    }
  }

  const { Database } = await import('#db/sqlite.js')
  const db = new Database(dbFile, { readonly: true })

  const violations: RepoAuditViolation[] = []

  try {
    // -----------------------------------------------------------------------
    // 1 + 3: rows in DB → verify file exists and hash matches
    // -----------------------------------------------------------------------
    const rows = db
      .prepare<[], BlueprintRow>('SELECT slug, file_path, content_hash FROM blueprints')
      .all()

    let checked = rows.length

    for (const row of rows) {
      const absPath = path.isAbsolute(row.file_path) ? row.file_path : path.join(cwd, row.file_path)

      if (!existsSync(absPath)) {
        violations.push({
          file: row.file_path,
          message: `Blueprint row for slug '${row.slug}' points to a file that no longer exists on disk`,
        })
        continue
      }

      const content = readFileSync(absPath, 'utf8')
      const actualHash = computeSha256(content)
      if (actualHash !== row.content_hash) {
        violations.push({
          file: row.file_path,
          message: `content_hash mismatch for slug '${row.slug}': DB has ${row.content_hash.slice(0, 8)}… but file hashes to ${actualHash.slice(0, 8)}…`,
        })
      }
    }

    // -----------------------------------------------------------------------
    // 2: files on disk → verify each has a DB row
    // -----------------------------------------------------------------------
    const dbPaths = new Set(rows.map((r) => r.file_path))

    const overviewFiles = scanBlueprintDirectory({
      baseDir: path.join(cwd, 'blueprints'),
      includeSpecialFolders: true,
    }).map((entry) => path.relative(cwd, entry.path).replace(/\\/g, '/'))

    checked += overviewFiles.length

    for (const rel of overviewFiles) {
      const normalised = rel.replace(/\\/g, '/')
      // DB may store absolute or repo-relative paths — check both forms
      const abs = path.join(cwd, rel)
      const hasRow = dbPaths.has(normalised) || dbPaths.has(abs)
      if (!hasRow) {
        violations.push({
          file: normalised,
          message: `Blueprint file exists on disk but has no corresponding row in the DB (run 'wp ingest' to update)`,
        })
      }
    }

    return {
      ok: violations.length === 0,
      title: 'Blueprint DB consistency (SQL)',
      checked,
      violations,
    }
  } finally {
    db.close()
  }
}
