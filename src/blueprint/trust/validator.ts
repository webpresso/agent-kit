import { parseTrustDossier, type TrustDossierViolation } from './dossier.js'
import { validateTrustAmbiguity } from './ambiguity.js'
import { validateTrustEvidence } from './evidence.js'

export interface ValidateBlueprintTrustInput {
  repoRoot: string
  file: string
  status: string
  markdown: string
  promotionCandidate?: boolean
}

export interface BlueprintTrustViolation extends TrustDossierViolation {
  file: string
}

export function validateBlueprintTrust(input: ValidateBlueprintTrustInput): {
  ok: boolean
  violations: BlueprintTrustViolation[]
} {
  if (input.status === 'draft' && input.promotionCandidate !== true)
    return { ok: true, violations: [] }
  if (!['planned', 'in-progress', 'completed', 'draft'].includes(input.status))
    return { ok: true, violations: [] }
  const parsed = parseTrustDossier(input.markdown)
  const violations: TrustDossierViolation[] = [...parsed.violations]
  if (parsed.dossier) {
    violations.push(...validateTrustEvidence(input.repoRoot, parsed.dossier))
    violations.push(...validateTrustAmbiguity(parsed.dossier))
    if (!parsed.dossier.readiness.promotionReady)
      violations.push({ section: 'Readiness Verdict', message: 'promotion-ready must be true' })
    if (
      parsed.dossier.readiness.unresolvedCount !== 0 ||
      Number.isNaN(parsed.dossier.readiness.unresolvedCount)
    )
      violations.push({ section: 'Readiness Verdict', message: 'unresolved-count must be 0' })
    if (!/^\d{4}-\d{2}-\d{2}T/u.test(parsed.dossier.readiness.verifiedAt))
      violations.push({
        section: 'Readiness Verdict',
        message: 'verified-at must be an ISO timestamp',
      })
    if (!/^[a-f0-9]{40}$/iu.test(parsed.dossier.readiness.verifiedHead))
      violations.push({
        section: 'Readiness Verdict',
        message: 'verified-head must be a full git SHA',
      })
    if (parsed.dossier.decisions.length === 0)
      violations.push({
        section: 'Material Decisions',
        message: 'at least one material decision is required',
      })
    for (const gate of parsed.dossier.gates) {
      if (!/^pass\b/iu.test(gate.lastResult))
        violations.push({
          section: 'Promotion Gates',
          claimId: gate.gate,
          message: 'promotion gate Last result must be pass',
        })
    }
  }
  return {
    ok: violations.length === 0,
    violations: violations.map((v) => ({ ...v, file: input.file })),
  }
}
