export const EVIDENCE_TYPES = [
  'deterministic_test',
  'dry_run',
  'mutation',
  'fixture_conformance',
  'live_conformance',
  'diagnostic_hook',
  'manual_note',
] as const

export type EvidenceType = (typeof EVIDENCE_TYPES)[number]

export type ClaimScope = 'fixed_suite_scientific' | 'provider_conformance' | 'diagnostic'

export type ClaimLedgerEntry = {
  readonly requirement_id: string
  readonly claim: string
  readonly claim_scope: ClaimScope
  readonly evidence_type: EvidenceType
  readonly validity_status: 'valid' | 'invalid' | 'diagnostic_only'
  readonly provider: 'none' | 'claude' | 'codex'
  readonly source_provenance: string
  readonly test_ids: readonly string[]
  readonly artifact_paths: readonly string[]
}

const FIXED_SUITE_EVIDENCE = new Set<EvidenceType>([
  'deterministic_test',
  'dry_run',
  'mutation',
  'fixture_conformance',
])

const PROVIDER_CONFORMANCE_EVIDENCE = new Set<EvidenceType>([
  'fixture_conformance',
  'live_conformance',
  'deterministic_test',
])

export function isEvidenceCompatibleWithScope(
  evidenceType: EvidenceType,
  claimScope: ClaimScope,
): boolean {
  if (claimScope === 'fixed_suite_scientific') return FIXED_SUITE_EVIDENCE.has(evidenceType)
  if (claimScope === 'provider_conformance') return PROVIDER_CONFORMANCE_EVIDENCE.has(evidenceType)
  return evidenceType === 'deterministic_test' || evidenceType === 'dry_run'
}

export function validateClaimLedger(entries: readonly ClaimLedgerEntry[]): void {
  for (const [index, entry] of entries.entries()) {
    if (!entry.requirement_id.trim()) throw new Error(`ledger[${index}] missing requirement_id`)
    if (!entry.claim.trim()) throw new Error(`ledger[${index}] missing claim`)
    if (!entry.source_provenance.trim()) {
      throw new Error(`ledger[${index}] missing source_provenance`)
    }
    if (entry.test_ids.length === 0) throw new Error(`ledger[${index}] missing test_ids`)
    if (!isEvidenceCompatibleWithScope(entry.evidence_type, entry.claim_scope)) {
      throw new Error(
        `ledger[${index}] evidence ${entry.evidence_type} cannot support ${entry.claim_scope}`,
      )
    }
  }
}
