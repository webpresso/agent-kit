import { parseTrustDossier, type TrustDossierViolation } from './dossier.js'
import { validateTrustAmbiguity } from './ambiguity.js'
import { validateTrustEvidence } from './evidence.js'
import { parseAllowedWpCommand } from './gates.js'

export type BlueprintTrustStatus = 'draft' | 'planned' | 'in-progress' | 'completed'

export type ValidateBlueprintTrustInput = {
  repoRoot: string
  file: string
  status: BlueprintTrustStatus
  markdown: string
  promotionCandidate?: boolean
  requirePassingGates?: boolean
  scanTaskAmbiguity?: boolean
}

export type BlueprintTrustViolation = TrustDossierViolation & {
  file: string
}

export function validateBlueprintTrust(input: ValidateBlueprintTrustInput): {
  ok: boolean
  violations: BlueprintTrustViolation[]
} {
  if (input.status === 'draft' && input.promotionCandidate !== true)
    return { ok: true, violations: [] }
  const parsed = parseTrustDossier(input.markdown)
  const violations: TrustDossierViolation[] = [...parsed.violations]
  if (parsed.dossier) {
    violations.push(...validateTrustEvidence(input.repoRoot, parsed.dossier))
    violations.push(
      ...validateTrustAmbiguity(
        parsed.dossier,
        input.scanTaskAmbiguity === true ? input.markdown : undefined,
      ),
    )
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
    if (parsed.dossier.claims.length === 0)
      violations.push({
        section: 'Material Claims',
        message: 'at least one material claim is required',
      })
    if (parsed.dossier.decisions.length === 0)
      violations.push({
        section: 'Material Decisions',
        message: 'at least one material decision is required',
      })
    if (parsed.dossier.gates.length === 0)
      violations.push({
        section: 'Promotion Gates',
        message: 'at least one promotion gate is required',
      })
    for (const gate of parsed.dossier.gates) {
      try {
        parseAllowedWpCommand(gate.command)
      } catch (error) {
        violations.push({
          section: 'Promotion Gates',
          claimId: gate.gate,
          message: error instanceof Error ? error.message : String(error),
        })
      }
      if (input.requirePassingGates !== false && !/^pass\b/iu.test(gate.lastResult))
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
