/**
 * `wp audit cross-repo-correlation`
 *
 * Wraps `auditCrossRepoCorrelation` from the blueprint cross-repo module into
 * the standard `RepoAuditResult` shape used by the audit registry.
 *
 * FAIL LOUD: any leak or missing allowlist produces a non-zero exit via the
 * audit framework. The audit does NOT auto-mutate anything.
 *
 * Alpha gate: only runs meaningful checks when WP_USE_SQL_AUDITS=1.
 */

import type { RepoAuditResult } from './repo-guardrails.js'
import { auditCrossRepoCorrelation } from '#cross-repo/audit.js'

export async function auditCrossRepoCorrelationAsRepoResult(cwd: string): Promise<RepoAuditResult> {
  if (!process.env['WP_USE_SQL_AUDITS']) {
    return {
      ok: true,
      title: 'Cross-repo correlation (SQL) — disabled (set WP_USE_SQL_AUDITS=1)',
      checked: 0,
      violations: [],
    }
  }

  const result = await auditCrossRepoCorrelation(cwd)

  const violations: Array<{ file?: string; message: string }> = []

  for (const leak of result.leaks) {
    violations.push({
      file: leak.blueprintSlug,
      message:
        `LEAK: public blueprint '${leak.blueprintSlug}' has unredacted reference to` +
        ` private slug '${leak.targetSlug}' in repo '${leak.targetRepo}'.` +
        ` Run 'wp fix cross-repo-leak ${leak.blueprintSlug}' to remediate.`,
    })
  }

  for (const missing of result.missingAllowlists) {
    const sides = missing.missingSides.join(' and ')
    violations.push({
      file: missing.blueprintSlug,
      message:
        `MISSING ALLOWLIST: cross-org dep from '${missing.sourceOrg}' → '${missing.targetOrg}'` +
        ` in blueprint '${missing.blueprintSlug}' (target: ${missing.targetRepo}).` +
        ` Missing allowlist on ${sides} side(s).` +
        ` Add mutual entries to .agent/correlate.allow.yaml in both repos.`,
    })
  }

  const checked = result.leaks.length + result.missingAllowlists.length

  return {
    ok: result.pass,
    title: 'Cross-repo correlation',
    checked: Math.max(checked, 1),
    violations,
  }
}
