import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { openDb } from '#db/connection.js'
import { auditBlueprintDbConsistency } from './blueprint-db-consistency.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function sha256(content: string): string {
  return createHash('sha256').update(content, 'utf8').digest('hex')
}

function makeTempRepo(): { cwd: string; agentDir: string; dbPath: string } {
  const cwd = mkdtempSync(path.join(tmpdir(), 'ak-audit-bp-db-test-'))
  const agentDir = path.join(cwd, '.agent')
  mkdirSync(agentDir, { recursive: true })
  const dbPath = path.join(agentDir, '.blueprints.db')
  return { cwd, agentDir, dbPath }
}

const OVERVIEW_CONTENT = `---
type: blueprint
status: in-progress
complexity: S
owner: alice
created: '2026-01-01'
last_updated: '2026-04-01'
tags: []
depends_on: []
---

# Test Blueprint
`

function insertBlueprintRow(
  db: ReturnType<typeof openDb>['db'],
  opts: {
    slug: string
    filePath: string
    contentHash: string
    status?: string
  },
): void {
  db.prepare(
    `INSERT INTO blueprints
       (slug, title, status, file_path, byte_size, content_hash, ingested_at,
        organization, visibility)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    opts.slug,
    'Test Blueprint',
    opts.status ?? 'in-progress',
    opts.filePath,
    100,
    opts.contentHash,
    Date.now(),
    'test-org',
    'private',
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let cwd: string
let dbPath: string
const _savedEnv: string | undefined = undefined

beforeEach(() => {
  const repo = makeTempRepo()
  cwd = repo.cwd
  dbPath = repo.dbPath
})

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true })
  // Restore env
  delete process.env['AK_USE_SQL_AUDITS']
})

describe('auditBlueprintDbConsistency — env gate', () => {
  it('returns disabled (ok: true) when AK_USE_SQL_AUDITS is not set', async () => {
    delete process.env['AK_USE_SQL_AUDITS']
    const result = await auditBlueprintDbConsistency(cwd)
    expect(result.ok).toBe(true)
    expect(result.violations).toHaveLength(0)
    expect(result.title).toContain('disabled')
  })
})

describe('auditBlueprintDbConsistency — with AK_USE_SQL_AUDITS=1', () => {
  beforeEach(() => {
    process.env['AK_USE_SQL_AUDITS'] = '1'
  })

  it('returns ok when DB matches filesystem (all files present and hashes match)', async () => {
    // Create blueprint file on disk
    const bpDir = path.join(cwd, 'blueprints', 'in-progress', 'my-feature')
    mkdirSync(bpDir, { recursive: true })
    const filePath = path.join(bpDir, '_overview.md')
    writeFileSync(filePath, OVERVIEW_CONTENT, 'utf8')

    // Insert matching row in DB
    const conn = openDb(dbPath)
    try {
      const relPath = path.relative(cwd, filePath).replace(/\\/g, '/')
      insertBlueprintRow(conn.db, {
        slug: 'my-feature',
        filePath: relPath,
        contentHash: sha256(OVERVIEW_CONTENT),
      })
    } finally {
      conn.close()
    }

    const result = await auditBlueprintDbConsistency(cwd)
    expect(result.ok).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('flags a DB row whose file_path no longer exists on disk (file-path drift)', async () => {
    const conn = openDb(dbPath)
    try {
      // Insert row pointing to a non-existent file
      insertBlueprintRow(conn.db, {
        slug: 'ghost-feature',
        filePath: 'blueprints/in-progress/ghost-feature/_overview.md',
        contentHash: sha256(OVERVIEW_CONTENT),
      })
    } finally {
      conn.close()
    }

    const result = await auditBlueprintDbConsistency(cwd)
    expect(result.ok).toBe(false)
    expect(
      result.violations.some(
        (v) => v.message.includes('ghost-feature') && /no longer exists/i.test(v.message),
      ),
    ).toBe(true)
  })

  it('flags a file on disk with a DB hash mismatch', async () => {
    // Create blueprint file on disk
    const bpDir = path.join(cwd, 'blueprints', 'in-progress', 'stale-feature')
    mkdirSync(bpDir, { recursive: true })
    const filePath = path.join(bpDir, '_overview.md')
    writeFileSync(filePath, OVERVIEW_CONTENT, 'utf8')

    const relPath = path.relative(cwd, filePath).replace(/\\/g, '/')
    const conn = openDb(dbPath)
    try {
      // Insert with a wrong (stale) hash
      insertBlueprintRow(conn.db, {
        slug: 'stale-feature',
        filePath: relPath,
        contentHash: sha256('different content that was ingested before'),
      })
    } finally {
      conn.close()
    }

    const result = await auditBlueprintDbConsistency(cwd)
    expect(result.ok).toBe(false)
    expect(
      result.violations.some(
        (v) => v.message.includes('stale-feature') && /mismatch/i.test(v.message),
      ),
    ).toBe(true)
  })

  it('flags a blueprint file on disk with no corresponding DB row', async () => {
    // Create blueprint file on disk with no DB row
    const bpDir = path.join(cwd, 'blueprints', 'planned', 'orphan-feature')
    mkdirSync(bpDir, { recursive: true })
    writeFileSync(path.join(bpDir, '_overview.md'), OVERVIEW_CONTENT, 'utf8')

    // DB is empty — no rows
    openDb(dbPath).close()

    const result = await auditBlueprintDbConsistency(cwd)
    expect(result.ok).toBe(false)
    expect(
      result.violations.some(
        (v) => /orphan-feature/.test(v.file ?? '') && /no corresponding row/i.test(v.message),
      ),
    ).toBe(true)
  })
})
