export const CAPABILITY_KEYS = [
  'execute',
  'batch_execute',
  'execute_file',
  'index_fetch',
  'restore',
  'search',
  'capture',
  'snapshot',
  'compaction',
  'native_backend',
  'rtk_totals',
] as const

export type CapabilityKey = (typeof CAPABILITY_KEYS)[number]

export type CapabilityStatus = 'measured' | 'degraded' | 'not_applicable' | 'planned'

export type CapabilityRow = {
  readonly key: CapabilityKey
  readonly status: CapabilityStatus
  readonly artifactPath?: string
  readonly notes?: string
}

// The registry — SSOT for what is measured vs planned.
// compaction must NOT be 'measured' until capture→snapshot→restore continuity passes.
// native_backend starts as 'planned' (CI builds native but live bench not yet measured).
// rtk_totals is 'not_applicable' (external tool, not our measurement surface).
export const CAPABILITY_REGISTRY: readonly CapabilityRow[] = [
  {
    key: 'execute',
    status: 'degraded',
    notes: 'session-memory bench tests it but full artifact not yet captured',
  },
  { key: 'batch_execute', status: 'planned' },
  { key: 'execute_file', status: 'planned' },
  { key: 'index_fetch', status: 'degraded' },
  { key: 'restore', status: 'degraded' },
  { key: 'search', status: 'degraded' },
  { key: 'capture', status: 'degraded' },
  { key: 'snapshot', status: 'degraded' },
  {
    key: 'compaction',
    status: 'planned',
    notes: 'must not be measured until capture→snapshot→restore continuity passes',
  },
  {
    key: 'native_backend',
    status: 'planned',
    notes: 'CI builds native but live bench not yet measured',
  },
  {
    key: 'rtk_totals',
    status: 'not_applicable',
    notes: 'external tool, not our measurement surface',
  },
]

// Returns array of error strings (empty = valid).
export function validateRegistry(registry: readonly CapabilityRow[]): readonly string[] {
  const errors: string[] = []

  const presentKeys = new Set(registry.map((r) => r.key))
  for (const key of CAPABILITY_KEYS) {
    if (!presentKeys.has(key)) {
      errors.push(`missing capability key in registry: ${key}`)
    }
  }

  for (const row of registry) {
    if (row.status === 'measured' && !row.artifactPath) {
      errors.push(`capability '${row.key}' has status 'measured' but no artifactPath`)
    }
    if (row.key === 'compaction' && row.status === 'measured') {
      errors.push(
        `capability 'compaction' must not be 'measured' until continuity passes; found status 'measured'`,
      )
    }
  }

  return errors
}

// Pattern that matches a capability key followed by ': measured' in docs text.
function extractMeasuredClaimsFromDocs(docsText: string): readonly string[] {
  const capabilityPattern = CAPABILITY_KEYS.join('|')
  const regex = new RegExp(`(${capabilityPattern}):\\s*measured`, 'g')
  const claimed: string[] = []
  let match: RegExpExecArray | null
  while ((match = regex.exec(docsText)) !== null) {
    claimed.push(match[1])
  }
  return claimed
}

// Cross-check: given text from docs/bench/reference-parity-matrix.md,
// ensure every capability claimed as "measured" in text has a corresponding
// 'measured' entry in the registry. Returns array of mismatches.
export function crossCheckAgainstReferenceParity(
  docsText: string,
  registry: readonly CapabilityRow[],
): readonly string[] {
  const claimed = extractMeasuredClaimsFromDocs(docsText)
  const measuredKeys = new Set(registry.filter((r) => r.status === 'measured').map((r) => r.key))

  return claimed
    .filter((key) => !measuredKeys.has(key as CapabilityKey))
    .map((key) => `docs claims '${key}' as measured but registry does not have it as 'measured'`)
}

// Checks docs text for any capability claimed as "measured" without a
// corresponding measured+artifactPath row. Used by the docs gate.
export function assertNoUnbackedMeasuredClaim(
  docsText: string,
  registry: readonly CapabilityRow[],
): readonly string[] {
  const claimed = extractMeasuredClaimsFromDocs(docsText)
  const backedKeys = new Set(
    registry.filter((r) => r.status === 'measured' && r.artifactPath).map((r) => r.key),
  )

  return claimed
    .filter((key) => !backedKeys.has(key as CapabilityKey))
    .map(
      (key) =>
        `docs claims '${key}' as measured but registry has no measured+artifactPath row for it`,
    )
}
