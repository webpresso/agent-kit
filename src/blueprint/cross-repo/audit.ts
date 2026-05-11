/**
 * Cross-repo correlation audit.
 *
 * Detects two classes of violation:
 *
 * 1. LEAKS — a public blueprint has an unredacted (is_redacted=0) cross-repo
 *    dependency on a private-repo blueprint. The slug has leaked into public
 *    markdown. FAIL LOUD, do NOT auto-mutate.
 *
 * 2. MISSING ALLOWLISTS — a cross-org dependency exists but at least one side
 *    has not allowlisted the other.
 *
 * The audit only detects and reports. Remediation requires manual intervention
 * via `ak fix cross-repo-leak <slug>` (or `fixCrossRepoLeak()` below).
 */

import { createHash } from 'node:crypto'
import { existsSync } from 'node:fs'
import path from 'node:path'

import Database from 'better-sqlite3'

import type { AllowlistEntry } from './resolver.js'
import { bothSidesAllowlistEntries } from './resolver.js'

export interface CrossRepoLeak {
  readonly blueprintSlug: string
  readonly targetRepo: string
  readonly targetSlug: string
  readonly sourceVisibility: string
  readonly targetVisibility: string | null
}

export interface MissingAllowlist {
  readonly blueprintSlug: string
  readonly sourceOrg: string
  readonly targetOrg: string
  readonly targetRepo: string
  readonly missingSides: ReadonlyArray<'source' | 'target'>
}

export interface CrossRepoAuditResult {
  readonly pass: boolean
  readonly leaks: ReadonlyArray<CrossRepoLeak>
  readonly missingAllowlists: ReadonlyArray<MissingAllowlist>
}

// ---------------------------------------------------------------------------
// Internal row shapes
// ---------------------------------------------------------------------------

interface CrossRepRow {
  blueprint_slug: string
  target_repo: string
  target_slug: string | null
  target_slug_hash: string | null
  is_redacted: number
  is_cross_org: number
  source_org: string
  source_visibility: string
}

interface WorkspaceRepoRow {
  repo_path: string
  organization: string
  repo_name: string
  visibility: string
}

interface AllowlistRow {
  source_org: string
  permitted_org: string
}

// ---------------------------------------------------------------------------
// Main audit
// ---------------------------------------------------------------------------

const DB_PATH = path.join('.agent', '.blueprints.db')

export async function auditCrossRepoCorrelation(
  cwd: string,
  _dryRun?: boolean,
): Promise<CrossRepoAuditResult> {
  const dbFile = path.join(cwd, DB_PATH)
  if (!existsSync(dbFile)) {
    // No DB — nothing to audit
    return { pass: true, leaks: [], missingAllowlists: [] }
  }

  const Database = (await import('better-sqlite3')).default
  const db = new Database(dbFile, { readonly: true })

  try {
    return runAudit(db)
  } finally {
    db.close()
  }
}

function runAudit(db: InstanceType<typeof Database>): CrossRepoAuditResult {
  // -------------------------------------------------------------------------
  // 1. Load cross_repo_dependencies joined with blueprint visibility
  // -------------------------------------------------------------------------
  const rows = db
    .prepare<
      [],
      CrossRepRow
    >(
      `SELECT crd.blueprint_slug,
              crd.target_repo,
              crd.target_slug,
              crd.target_slug_hash,
              crd.is_redacted,
              crd.is_cross_org,
              b.organization AS source_org,
              b.visibility   AS source_visibility
         FROM cross_repo_dependencies crd
         JOIN blueprints b ON b.slug = crd.blueprint_slug`,
    )
    .all()

  // -------------------------------------------------------------------------
  // 2. Load workspace_repos for target visibility lookup
  // -------------------------------------------------------------------------
  const workspaceRepos = db
    .prepare<[], WorkspaceRepoRow>('SELECT repo_path, organization, repo_name, visibility FROM workspace_repos')
    .all()

  const repoVisibility = new Map<string, string>()
  for (const wr of workspaceRepos) {
    // Key by "org/repo-name" to match target_repo in cross_repo_dependencies
    repoVisibility.set(`${wr.organization}/${wr.repo_name}`, wr.visibility)
  }

  // -------------------------------------------------------------------------
  // 3. Load correlate_allowlist
  // -------------------------------------------------------------------------
  const allowlistRows = db
    .prepare<[], AllowlistRow>('SELECT source_org, permitted_org FROM correlate_allowlist')
    .all()
  const allowlist: AllowlistEntry[] = allowlistRows.map((r) => ({
    source_org: r.source_org,
    permitted_org: r.permitted_org,
  }))

  // -------------------------------------------------------------------------
  // 4. Detect leaks and missing allowlists
  // -------------------------------------------------------------------------
  const leaks: CrossRepoLeak[] = []
  const missingAllowlists: MissingAllowlist[] = []

  for (const row of rows) {
    const targetVisibility = repoVisibility.get(row.target_repo) ?? null

    // Leak: is_redacted=0 but target is private and source is public
    if (
      row.is_redacted === 0 &&
      row.target_slug !== null &&
      targetVisibility === 'private' &&
      row.source_visibility === 'public'
    ) {
      leaks.push({
        blueprintSlug: row.blueprint_slug,
        targetRepo: row.target_repo,
        targetSlug: row.target_slug,
        sourceVisibility: row.source_visibility,
        targetVisibility,
      })
    }

    // Missing allowlist: cross-org dep without mutual allowlist
    if (row.is_cross_org === 1) {
      const sourceOrg = row.source_org
      const targetOrg = row.target_repo.split('/')[0] ?? 'unknown'

      if (!bothSidesAllowlistEntries(sourceOrg, targetOrg, allowlist)) {
        const sourcePerm = allowlist.some(
          (e) => e.source_org === sourceOrg && e.permitted_org === targetOrg,
        )
        const targetPerm = allowlist.some(
          (e) => e.source_org === targetOrg && e.permitted_org === sourceOrg,
        )
        const missingSides: Array<'source' | 'target'> = []
        if (!sourcePerm) missingSides.push('source')
        if (!targetPerm) missingSides.push('target')

        missingAllowlists.push({
          blueprintSlug: row.blueprint_slug,
          sourceOrg,
          targetOrg,
          targetRepo: row.target_repo,
          missingSides,
        })
      }
    }
  }

  return {
    pass: leaks.length === 0 && missingAllowlists.length === 0,
    leaks,
    missingAllowlists,
  }
}

// ---------------------------------------------------------------------------
// Remediation (NOT auto-invoked by audit)
// ---------------------------------------------------------------------------

export interface FixResult {
  readonly fixed: boolean
  readonly reason: string
}

/**
 * Remediate a single leak for `blueprintSlug` by redacting its cross-repo
 * target slug in the DB: sets `target_slug=null`, `target_slug_hash=sha256(slug)`,
 * `is_redacted=1`.
 *
 * This function is intentionally NOT called by `auditCrossRepoCorrelation`.
 * It must be invoked explicitly via `ak fix cross-repo-leak <slug>`.
 */
export async function fixCrossRepoLeak(cwd: string, blueprintSlug: string): Promise<FixResult> {
  const dbFile = path.join(cwd, DB_PATH)
  if (!existsSync(dbFile)) {
    return { fixed: false, reason: 'DB file not found' }
  }

  const DatabaseMod = (await import('better-sqlite3')).default
  const db = new DatabaseMod(dbFile)

  try {
    const rows = db
      .prepare<[string], { target_slug: string | null; target_repo: string }>(
        'SELECT target_slug, target_repo FROM cross_repo_dependencies WHERE blueprint_slug = ? AND is_redacted = 0',
      )
      .all(blueprintSlug)

    if (rows.length === 0) {
      return { fixed: false, reason: 'No unredacted cross-repo dependency found for this slug' }
    }

    db.transaction(() => {
      for (const row of rows) {
        if (row.target_slug === null) continue
        const hash = createHash('sha256').update(row.target_slug).digest('hex')
        db.prepare(
          `UPDATE cross_repo_dependencies
             SET target_slug = NULL, target_slug_hash = ?, is_redacted = 1
           WHERE blueprint_slug = ? AND target_repo = ?`,
        ).run(hash, blueprintSlug, row.target_repo)
      }
    })()

    return { fixed: true, reason: `Redacted ${rows.length} cross-repo dependency row(s)` }
  } finally {
    db.close()
  }
}
