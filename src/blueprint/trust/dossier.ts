export type TrustReadinessVerdict = {
  promotionReady: boolean
  unresolvedCount: number
  verifiedAt: string
  verifiedHead: string
  trustGateVersion: string
}

export type TrustMaterialClaim = {
  id: string
  claim: string
  evidence: string
}

export type TrustMaterialDecision = {
  id: string
  decision: string
  chosenOption: string
  rejectedAlternatives: string
  rationale: string
}

export type TrustPromotionGate = {
  gate: string
  command: string
  expectedOutcome: string
  lastResult: string
}

export type TrustDossier = {
  readiness: TrustReadinessVerdict
  claims: TrustMaterialClaim[]
  decisions: TrustMaterialDecision[]
  gates: TrustPromotionGate[]
  residualUnknowns: string
}

export type TrustDossierViolation = {
  section: string
  claimId?: string
  message: string
}

const REQUIRED_SUBSECTIONS = [
  'Readiness Verdict',
  'Material Claims',
  'Material Decisions',
  'Promotion Gates',
  'Residual Unknowns',
] as const

export function parseTrustDossier(markdown: string): {
  dossier?: TrustDossier
  violations: TrustDossierViolation[]
} {
  const stripped = stripFencedCodeBlocks(markdown)
  const dossierBlock = sectionBlock(stripped, 2, 'Trust Dossier')
  const violations: TrustDossierViolation[] = []
  if (dossierBlock === null) {
    return { violations: [{ section: 'Trust Dossier', message: 'missing Trust Dossier section' }] }
  }

  const blocks = new Map<string, string>()
  for (const subsection of REQUIRED_SUBSECTIONS) {
    const block = sectionBlock(dossierBlock, 3, subsection)
    if (block === null) {
      violations.push({ section: subsection, message: `missing ${subsection} subsection` })
    } else {
      blocks.set(subsection, block)
    }
    if (countHeading(dossierBlock, 3, subsection) > 1) {
      violations.push({ section: subsection, message: `duplicate ${subsection} subsection` })
    }
  }
  if (violations.length > 0) return { violations }

  const readiness = parseReadiness(requiredBlock(blocks, 'Readiness Verdict'), violations)
  const claims = parseTable(
    requiredBlock(blocks, 'Material Claims'),
    'Material Claims',
    ['ID', 'Claim', 'Evidence'],
    ([id = '', claim = '', evidence = '']) => ({ id, claim, evidence }),
    violations,
  )
  const decisions = parseTable(
    requiredBlock(blocks, 'Material Decisions'),
    'Material Decisions',
    ['ID', 'Decision', 'Chosen option', 'Rejected alternatives', 'Rationale'],
    ([id = '', decision = '', chosenOption = '', rejectedAlternatives = '', rationale = '']) => ({
      id,
      decision,
      chosenOption,
      rejectedAlternatives,
      rationale,
    }),
    violations,
  )
  const gates = parseTable(
    requiredBlock(blocks, 'Promotion Gates'),
    'Promotion Gates',
    ['Gate', 'Command', 'Expected outcome', 'Last result'],
    ([gate = '', command = '', expectedOutcome = '', lastResult = '']) => ({
      gate,
      command,
      expectedOutcome,
      lastResult,
    }),
    violations,
  )
  const residualUnknowns = requiredBlock(blocks, 'Residual Unknowns').trim()

  for (const [section, block] of blocks) {
    if (containsPlaceholder(block))
      violations.push({ section, message: 'placeholder values are not allowed' })
  }

  if (violations.length > 0 || readiness === null) return { violations }
  return { dossier: { readiness, claims, decisions, gates, residualUnknowns }, violations }
}

export function stripFencedCodeBlocks(markdown: string): string {
  return markdown.replace(/^```[\s\S]*?^```/gmu, '')
}

function sectionBlock(markdown: string, level: number, title: string): string | null {
  const hashes = '#'.repeat(level)
  const re = new RegExp(`^${hashes}\\s+${escapeRegExp(title)}\\s*$`, 'im')
  const match = re.exec(markdown)
  if (!match || match.index === undefined) return null
  const start = match.index + match[0].length
  const next = new RegExp(`^#{1,${level}}\\s+`, 'im')
  const rest = markdown.slice(start)
  const nextMatch = next.exec(rest)
  return (nextMatch ? rest.slice(0, nextMatch.index) : rest).trim()
}

function countHeading(markdown: string, level: number, title: string): number {
  const hashes = '#'.repeat(level)
  return [...markdown.matchAll(new RegExp(`^${hashes}\\s+${escapeRegExp(title)}\\s*$`, 'gim'))]
    .length
}

function parseReadiness(
  block: string,
  violations: TrustDossierViolation[],
): TrustReadinessVerdict | null {
  const values = new Map<string, string>()
  for (const line of block.split('\n')) {
    const match = /^-\s*([^:]+):\s*(.+?)\s*$/u.exec(line.trim())
    const key = match?.[1]
    const value = match?.[2]
    if (key !== undefined && value !== undefined) values.set(key.trim(), value.trim())
  }
  const required = [
    'promotion-ready',
    'unresolved-count',
    'verified-at',
    'verified-head',
    'trust-gate-version',
  ]
  for (const key of required) {
    if (!values.has(key))
      violations.push({ section: 'Readiness Verdict', message: `missing ${key}` })
  }
  if (required.some((key) => !values.has(key))) return null
  return {
    promotionReady: requiredValue(values, 'promotion-ready') === 'true',
    unresolvedCount: Number.parseInt(requiredValue(values, 'unresolved-count'), 10),
    verifiedAt: requiredValue(values, 'verified-at'),
    verifiedHead: requiredValue(values, 'verified-head'),
    trustGateVersion: requiredValue(values, 'trust-gate-version'),
  }
}

function parseTable<T>(
  block: string,
  section: string,
  expectedHeader: string[],
  build: (cells: string[]) => T,
  violations: TrustDossierViolation[],
): T[] {
  const rows = block
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('|') && line.endsWith('|'))
  if (rows.length < 2) {
    violations.push({ section, message: 'missing markdown table' })
    return []
  }
  const header = splitRow(rows[0] ?? '')
  if (header.join('|').toLowerCase() !== expectedHeader.join('|').toLowerCase()) {
    violations.push({ section, message: `malformed table header for ${section}` })
    return []
  }
  const result: T[] = []
  for (const row of rows.slice(2)) {
    const cells = splitRow(row)
    if (cells.length !== expectedHeader.length) {
      violations.push({ section, message: `malformed table row in ${section}` })
      continue
    }
    result.push(build(cells))
  }
  return result
}

function requiredBlock(blocks: Map<string, string>, key: string): string {
  const value = blocks.get(key)
  if (value === undefined) throw new Error(`missing parsed Trust Dossier block: ${key}`)
  return value
}

function requiredValue(values: Map<string, string>, key: string): string {
  const value = values.get(key)
  if (value === undefined) throw new Error(`missing parsed Readiness Verdict value: ${key}`)
  return value
}

function splitRow(row: string): string[] {
  return row
    .slice(1, -1)
    .split('|')
    .map((cell) => cell.trim())
}

function containsPlaceholder(value: string): boolean {
  return /<[^>]+>|\bTBD\b|\bTODO\b/u.test(value)
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}
