import { mkdtempSync, mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { openDb } from '../blueprint/db/connection.js'
import { resolveBlueprintProjectionDbPath } from '../blueprint/db/paths.js'
import { auditTechDebtCadence } from './tech-debt-cadence.js'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeTempRepo(): { cwd: string; dbPath: string } {
  const cwd = mkdtempSync(path.join(tmpdir(), 'wp-audit-td-cadence-'))
  const dbPath = resolveBlueprintProjectionDbPath(cwd)
  mkdirSync(path.dirname(dbPath), { recursive: true })
  return { cwd, dbPath }
}

interface InsertTechDebtOpts {
  slug: string
  status?: string
  severity?: string
  reviewCadence?: string
  nextReview?: string | null
  lastReviewed?: string | null
  created?: string | null
}

function insertTechDebtItem(db: ReturnType<typeof openDb>['db'], opts: InsertTechDebtOpts): void {
  db.prepare(
    `INSERT INTO tech_debt_items
       (slug, status, severity, category, review_cadence,
        next_review, last_reviewed, created,
        file_path, byte_size, content_hash, organization, visibility)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  ).run(
    opts.slug,
    opts.status ?? 'accepted',
    opts.severity ?? 'medium',
    'testing',
    opts.reviewCadence ?? 'quarterly',
    opts.nextReview ?? null,
    opts.lastReviewed ?? null,
    opts.created ?? null,
    `tech-debt/accepted/${opts.slug}.md`,
    100,
    'deadbeef',
    'test-org',
    'private',
  )
}

function daysAgo(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString().slice(0, 10)
}

function daysFromNow(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString().slice(0, 10)
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

let cwd: string
let dbPath: string

beforeEach(() => {
  const repo = makeTempRepo()
  cwd = repo.cwd
  dbPath = repo.dbPath
})

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true })
  delete process.env['WP_USE_SQL_AUDITS']
})

describe('auditTechDebtCadence — env gate', () => {
  it('returns disabled (ok: true) when WP_USE_SQL_AUDITS is not set', async () => {
    delete process.env['WP_USE_SQL_AUDITS']
    const result = await auditTechDebtCadence(cwd)
    expect(result.ok).toBe(true)
    expect(result.violations).toHaveLength(0)
    expect(result.title).toContain('disabled')
  })
})

describe('auditTechDebtCadence — with WP_USE_SQL_AUDITS=1', () => {
  beforeEach(() => {
    process.env['WP_USE_SQL_AUDITS'] = '1'
  })

  it('returns ok when DB is empty', async () => {
    openDb(dbPath).close()
    const result = await auditTechDebtCadence(cwd)
    expect(result.ok).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('catches an overdue item (next_review in the past)', async () => {
    const conn = openDb(dbPath)
    try {
      insertTechDebtItem(conn.db, {
        slug: 'h-001-overdue',
        severity: 'medium',
        reviewCadence: 'monthly',
        nextReview: daysAgo(5), // 5 days overdue
        lastReviewed: daysAgo(35),
      })
    } finally {
      conn.close()
    }

    const result = await auditTechDebtCadence(cwd)
    expect(result.ok).toBe(false)
    expect(
      result.violations.some(
        (v) => v.message.includes('h-001-overdue') && /overdue/i.test(v.message),
      ),
    ).toBe(true)
  })

  it('passes when next_review is in the future', async () => {
    const conn = openDb(dbPath)
    try {
      insertTechDebtItem(conn.db, {
        slug: 'h-002-future',
        severity: 'medium',
        reviewCadence: 'monthly',
        nextReview: daysFromNow(10),
        lastReviewed: daysAgo(20),
      })
    } finally {
      conn.close()
    }

    const result = await auditTechDebtCadence(cwd)
    expect(result.ok).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('catches critical item with non-weekly cadence', async () => {
    const conn = openDb(dbPath)
    try {
      insertTechDebtItem(conn.db, {
        slug: 'h-003-critical-monthly',
        severity: 'critical',
        reviewCadence: 'monthly', // should be weekly
        nextReview: daysFromNow(10),
        lastReviewed: daysAgo(20),
      })
    } finally {
      conn.close()
    }

    const result = await auditTechDebtCadence(cwd)
    expect(result.ok).toBe(false)
    expect(
      result.violations.some(
        (v) => v.message.includes('h-003-critical-monthly') && /weekly/i.test(v.message),
      ),
    ).toBe(true)
  })

  it('passes when critical item has weekly cadence', async () => {
    const conn = openDb(dbPath)
    try {
      insertTechDebtItem(conn.db, {
        slug: 'h-004-critical-weekly',
        severity: 'critical',
        reviewCadence: 'weekly',
        nextReview: daysFromNow(3),
        lastReviewed: daysAgo(4),
      })
    } finally {
      conn.close()
    }

    const result = await auditTechDebtCadence(cwd)
    expect(result.ok).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('catches item never reviewed and created >90 days ago', async () => {
    const conn = openDb(dbPath)
    try {
      insertTechDebtItem(conn.db, {
        slug: 'h-005-stale',
        severity: 'low',
        reviewCadence: 'quarterly',
        nextReview: null,
        lastReviewed: null, // never reviewed
        created: daysAgo(100), // 100 days ago
      })
    } finally {
      conn.close()
    }

    const result = await auditTechDebtCadence(cwd)
    expect(result.ok).toBe(false)
    expect(
      result.violations.some(
        (v) => v.message.includes('h-005-stale') && /never been reviewed/i.test(v.message),
      ),
    ).toBe(true)
  })

  it('passes when item never reviewed but created ≤90 days ago', async () => {
    const conn = openDb(dbPath)
    try {
      insertTechDebtItem(conn.db, {
        slug: 'h-006-new',
        severity: 'low',
        reviewCadence: 'quarterly',
        nextReview: null,
        lastReviewed: null,
        created: daysAgo(30), // only 30 days old — under threshold
      })
    } finally {
      conn.close()
    }

    const result = await auditTechDebtCadence(cwd)
    expect(result.ok).toBe(true)
    expect(result.violations).toHaveLength(0)
  })
})
