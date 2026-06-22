import type { TrustDossier, TrustDossierViolation } from './dossier.js'

const BANNED = /\b(TBD|TODO|decide during implementation|open question)\b|<[^>]+>/iu

export function validateTrustAmbiguity(dossier: TrustDossier): TrustDossierViolation[] {
  const violations: TrustDossierViolation[] = []
  const checks: Array<[string, string, string | undefined]> = [
    ['Residual Unknowns', dossier.residualUnknowns, undefined],
    ...dossier.decisions.flatMap((d) => [
      ['Material Decisions', d.decision, d.id] as [string, string, string],
      ['Material Decisions', d.chosenOption, d.id] as [string, string, string],
      ['Material Decisions', d.rationale, d.id] as [string, string, string],
    ]),
    ...dossier.gates.flatMap((g) => [
      ['Promotion Gates', g.command, g.gate] as [string, string, string],
      ['Promotion Gates', g.expectedOutcome, g.gate] as [string, string, string],
      ['Promotion Gates', g.lastResult, g.gate] as [string, string, string],
    ]),
  ]
  for (const [section, value, claimId] of checks) {
    if (BANNED.test(value))
      violations.push({
        section,
        claimId,
        message: 'unresolved ambiguity is not allowed in executable trust sections',
      })
  }
  if (dossier.residualUnknowns.trim() !== 'None.')
    violations.push({
      section: 'Residual Unknowns',
      message: 'Residual Unknowns must be exactly `None.`',
    })
  return violations
}
