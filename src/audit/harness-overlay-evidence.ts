import type { RepoAuditResult } from '#audit/repo-guardrails'
import { validateAgentOverlays } from '#symlinker/overlay-loader'

export function auditHarnessOverlayEvidence(rootDirectory: string = process.cwd()): RepoAuditResult {
  const result = validateAgentOverlays(rootDirectory)
  return {
    ok: result.ok,
    title: 'Harness overlay evidence',
    checked: result.overlays.length,
    violations: result.violations,
  }
}
