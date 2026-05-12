/**
 * Tech-debt subcommand dispatch.
 *
 * Handles: new, list, review
 *
 * Note: list and review use direct file scanning (not TechDebtService) because
 * the service uses README.md file pattern for subdirectory-based layout, while
 * the h-NNN-*.md flat file layout is what we write via `ak tech-debt new`.
 */
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'

import matter from 'gray-matter'

import { resolveTechDebtRoot } from '#utils/tech-debt-root'
import {
  categorySchema,
  reviewCadenceSchema,
  severitySchema,
  techDebtFrontmatterSchema,
  techDebtStatusSchema,
  type TechDebtCategory,
  type TechDebtSeverity,
  type TechDebtStatus,
  type ReviewCadence,
} from '#tech-debt/index'

export interface TechDebtNewOptions {
  severity?: TechDebtSeverity | string
  category?: TechDebtCategory | string
  reviewCadence?: ReviewCadence | string
  status?: TechDebtStatus | string
  dryRun?: boolean
  cwd?: string
  fromAudit?: string
}

export interface TechDebtListOptions {
  status?: string
  severity?: string
  category?: string
  cwd?: string
}

export interface TechDebtReviewOptions {
  cwd?: string
}

export type TechDebtCommandOptions = TechDebtNewOptions &
  TechDebtListOptions &
  TechDebtReviewOptions

const STATUS_DIRS = ['accepted', 'needs-remediation', 'monitoring', 'resolved'] as const

interface ScannedItem {
  slug: string
  title: string
  status: string
  severity: string
  category?: string
  nextReview?: string
  filePath: string
  malformed?: string
}

/**
 * Convert a title to kebab-case for file naming.
 */
function toKebab(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

/**
 * Find the next available h-NNN number across all status subdirectories.
 */
function nextHazardNumber(techDebtRoot: string): number {
  if (!existsSync(techDebtRoot)) return 1

  let maxN = 0

  for (const statusDir of STATUS_DIRS) {
    const dir = path.join(techDebtRoot, statusDir)
    if (!existsSync(dir)) continue
    try {
      for (const file of readdirSync(dir)) {
        const match = /^h-(\d+)-/.exec(file)
        if (match?.[1]) {
          const n = parseInt(match[1], 10)
          if (n > maxN) maxN = n
        }
      }
    } catch {
      // ignore unreadable dirs
    }
  }

  return maxN + 1
}

/**
 * Format a hazard number as zero-padded 3-digit string.
 */
function formatHazardNumber(n: number): string {
  return String(n).padStart(3, '0')
}

// ── From-audit helpers ────────────────────────────────────────────────────────

type SupportedAuditName = 'skill-sizes' | 'broken-refs' | 'memory-rotation'

interface AuditFinding {
  file?: string
  message: string
}

interface FromAuditResult {
  findings: AuditFinding[]
  auditName: SupportedAuditName
}

const SUPPORTED_FROM_AUDIT_NAMES = ['skill-sizes', 'broken-refs', 'memory-rotation'] as const

function isSupportedAuditName(name: string): name is SupportedAuditName {
  return (SUPPORTED_FROM_AUDIT_NAMES as readonly string[]).includes(name)
}

/**
 * Run the named audit and extract findings.
 */
async function runAuditForTechDebt(
  auditName: SupportedAuditName,
  cwd: string,
): Promise<FromAuditResult> {
  switch (auditName) {
    case 'skill-sizes': {
      const { auditSkillSizes } = await import('#audit/skill-sizes')
      const result = auditSkillSizes(cwd)
      return { auditName, findings: result.violations }
    }
    case 'broken-refs': {
      const { auditBrokenRefs } = await import('#audit/broken-refs')
      const result = auditBrokenRefs(cwd)
      return { auditName, findings: result.violations }
    }
    case 'memory-rotation': {
      const { auditMemoryRotation } = await import('#audit/memory-rotation')
      const result = auditMemoryRotation(cwd, { strict: false })
      // Surface unacked rotations as findings
      const findings = result.recentEvents
        .filter((e) => !e.acked)
        .map((e) => ({
          file: e.sourcePath,
          message: `Unacked rotation: section '${e.sectionSlug}' (${e.daysAgo}d ago)`,
        }))
      return { auditName, findings }
    }
  }
}

/**
 * Compute a content-hash idempotency key: sha256(auditName + JSON.stringify(sortedFindings)).
 */
function computeAutoFiledHash(auditName: string, findings: AuditFinding[]): string {
  const sorted = [...findings].sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  const input = auditName + JSON.stringify(sorted)
  return createHash('sha256').update(input).digest('hex').slice(0, 16)
}

/**
 * Check if an existing tech-debt file has the given auto_filed_hash.
 */
function findExistingByHash(techDebtRoot: string, hash: string): string | null {
  for (const statusDir of STATUS_DIRS) {
    const dir = path.join(techDebtRoot, statusDir)
    if (!existsSync(dir)) continue
    let entries: string[]
    try {
      entries = readdirSync(dir).filter((f) => f.endsWith('.md'))
    } catch {
      continue
    }
    for (const filename of entries) {
      const filePath = path.join(dir, filename)
      try {
        const raw = readFileSync(filePath, 'utf8')
        const parsed = matter(raw)
        if (parsed.data?.['auto_filed_hash'] === hash) {
          return filePath
        }
      } catch {
        // ignore
      }
    }
  }
  return null
}

/**
 * Map audit name to suggested severity.
 */
function auditNameToSeverity(auditName: SupportedAuditName): TechDebtSeverity {
  switch (auditName) {
    case 'skill-sizes':
      return 'medium'
    case 'broken-refs':
      return 'high'
    case 'memory-rotation':
      return 'low'
  }
}

/**
 * Generate content for an auto-filed tech-debt entry from audit findings.
 */
function generateFromAuditContent(
  title: string,
  options: {
    status: TechDebtStatus
    severity: TechDebtSeverity
    category: TechDebtCategory
    reviewCadence: ReviewCadence
    autoFiledHash: string
    linkedBlueprints: readonly string[]
    findings: AuditFinding[]
  },
): string {
  const today = new Date().toISOString().slice(0, 10)
  const linkedBlueprintsYaml =
    options.linkedBlueprints.length > 0
      ? options.linkedBlueprints.map((b) => `  - ${b}`).join('\n')
      : ''

  const findingsSummary = options.findings
    .slice(0, 10)
    .map((f) => `- ${f.file ? `\`${f.file}\`: ` : ''}${f.message}`)
    .join('\n')

  const moreCount =
    options.findings.length > 10 ? `\n…and ${options.findings.length - 10} more` : ''

  return [
    '---',
    'type: tech-debt',
    `status: ${options.status}`,
    `severity: ${options.severity}`,
    `category: ${options.category}`,
    `review_cadence: ${options.reviewCadence}`,
    `last_reviewed: '${today}'`,
    `created: '${today}'`,
    `auto_filed_hash: ${options.autoFiledHash}`,
    linkedBlueprintsYaml ? `linked_blueprints:\n${linkedBlueprintsYaml}` : 'linked_blueprints: []',
    'affected_modules: []',
    '---',
    '',
    `# ${title}`,
    '',
    '## Findings',
    '',
    findingsSummary + moreCount,
    '',
    '<!-- Auto-filed from audit. Update this file as issues are resolved. -->',
    '',
  ].join('\n')
}

async function handleNewFromAudit(auditName: string, options: TechDebtNewOptions): Promise<void> {
  if (!isSupportedAuditName(auditName)) {
    throw new Error(
      `Unknown audit name: ${auditName}. Supported: ${SUPPORTED_FROM_AUDIT_NAMES.join(', ')}`,
    )
  }

  const cwd = options.cwd ?? process.cwd()
  const techDebtRoot = resolveTechDebtRoot(cwd)

  const auditResult = await runAuditForTechDebt(auditName, cwd)
  const hash = computeAutoFiledHash(auditName, auditResult.findings)

  // Idempotency check: bail if already filed
  const existing = findExistingByHash(techDebtRoot, hash)
  if (existing) {
    console.log(`Already filed: ${existing}`)
    return
  }

  const severity = auditNameToSeverity(auditName)
  const category: TechDebtCategory = 'documentation'
  const reviewCadence: ReviewCadence = 'biweekly'
  const status: TechDebtStatus = 'needs-remediation'
  const today = new Date().toISOString().slice(0, 10)
  const title = `Audit: ${auditName} findings — ${today}`
  const linkedBlueprints = [
    'agent-asset-compiler-multi-runtime',
    'agent-asset-audit-slice',
  ] as const

  const kebabTitle = toKebab(title)
  const n = nextHazardNumber(techDebtRoot)
  const filename = `h-${formatHazardNumber(n)}-${kebabTitle}.md`
  const statusDir = path.join(techDebtRoot, status)
  const filePath = path.join(statusDir, filename)

  if (options.dryRun) {
    console.log(`Would create: ${filePath}`)
    return
  }

  await mkdir(statusDir, { recursive: true })
  const content = generateFromAuditContent(title, {
    status,
    severity,
    category,
    reviewCadence,
    autoFiledHash: hash,
    linkedBlueprints,
    findings: auditResult.findings,
  })
  await writeFile(filePath, content, { flag: 'wx' })
  console.log(`Created: ${filePath}`)
}

/**
 * Generate the markdown content for a new tech-debt file.
 */
function generateTechDebtContent(
  title: string,
  options: {
    status: TechDebtStatus
    severity: TechDebtSeverity
    category: TechDebtCategory
    reviewCadence: ReviewCadence
  },
): string {
  const today = new Date().toISOString().slice(0, 10)

  return [
    '---',
    'type: tech-debt',
    `status: ${options.status}`,
    `severity: ${options.severity}`,
    `category: ${options.category}`,
    `review_cadence: ${options.reviewCadence}`,
    `last_reviewed: '${today}'`,
    `created: '${today}'`,
    'linked_blueprints: []',
    'affected_modules: []',
    '---',
    '',
    `# ${title}`,
    '',
    '<!-- Describe the technical debt, its impact, and remediation approach. -->',
    '',
  ].join('\n')
}

/**
 * Extract the title from the markdown body (first H1).
 */
function extractTitle(markdownBody: string, fallback: string): string {
  const match = /^#\s+(.+)$/m.exec(markdownBody)
  return match?.[1]?.trim() ?? fallback
}

/**
 * Scan all tech-debt .md files from the status subdirectories.
 */
function scanTechDebtItems(techDebtRoot: string): ScannedItem[] {
  const items: ScannedItem[] = []

  if (!existsSync(techDebtRoot)) return items

  for (const statusDir of STATUS_DIRS) {
    const dir = path.join(techDebtRoot, statusDir)
    if (!existsSync(dir)) continue

    let entries: string[]
    try {
      entries = readdirSync(dir).filter((f) => f.endsWith('.md'))
    } catch {
      continue
    }

    for (const filename of entries.sort()) {
      const filePath = path.join(dir, filename)
      const slug = `${statusDir}/${filename.replace(/\.md$/, '')}`

      try {
        const raw = readFileSync(filePath, 'utf8')
        const parsed = matter(raw)
        const result = techDebtFrontmatterSchema.safeParse(parsed.data)

        if (!result.success) {
          const firstError = result.error.issues[0]
          items.push({
            slug,
            title: (parsed.data?.['title'] as string) || filename,
            status: (parsed.data?.['status'] as string) || statusDir,
            severity: (parsed.data?.['severity'] as string) || 'unknown',
            category: parsed.data?.['category'] as string | undefined,
            filePath,
            malformed: firstError
              ? `${firstError.path.join('.')}: ${firstError.message}`
              : 'Invalid frontmatter',
          })
          continue
        }

        items.push({
          slug,
          title: extractTitle(parsed.content, filename),
          status: result.data.status,
          severity: result.data.severity,
          category: result.data.category,
          nextReview: result.data.nextReview,
          filePath,
        })
      } catch (err) {
        items.push({
          slug,
          title: filename,
          status: statusDir,
          severity: 'unknown',
          filePath,
          malformed: err instanceof Error ? err.message : String(err),
        })
      }
    }
  }

  return items
}

async function handleNew(title: string, options: TechDebtNewOptions): Promise<void> {
  // Delegate to from-audit path when requested
  if (options.fromAudit !== undefined) {
    await handleNewFromAudit(options.fromAudit, options)
    return
  }

  const cwd = options.cwd ?? process.cwd()
  const techDebtRoot = resolveTechDebtRoot(cwd)

  // Validate inputs
  const severityResult = severitySchema.safeParse(options.severity ?? 'medium')
  if (!severityResult.success) {
    throw new Error(
      `Invalid severity: ${options.severity}. Must be one of: critical, high, medium, low`,
    )
  }

  const categoryResult = categorySchema.safeParse(options.category ?? 'complexity')
  if (!categoryResult.success) {
    throw new Error(
      `Invalid category: ${options.category}. Must be one of: complexity, testing, mutation, duplication, dependency, security, documentation`,
    )
  }

  const cadenceResult = reviewCadenceSchema.safeParse(options.reviewCadence ?? 'quarterly')
  if (!cadenceResult.success) {
    throw new Error(
      `Invalid review-cadence: ${options.reviewCadence}. Must be one of: weekly, biweekly, monthly, quarterly`,
    )
  }

  const statusResult = techDebtStatusSchema.safeParse(options.status ?? 'accepted')
  if (!statusResult.success) {
    throw new Error(
      `Invalid status: ${options.status}. Must be one of: accepted, needs-remediation, monitoring, resolved`,
    )
  }

  const severity = severityResult.data
  const category = categoryResult.data
  const reviewCadence = cadenceResult.data
  const status = statusResult.data

  // Extra validation: critical must have weekly cadence
  if (severity === 'critical' && reviewCadence !== 'weekly') {
    throw new Error('Critical severity technical debt must have weekly review cadence')
  }

  const kebabTitle = toKebab(title)
  const n = nextHazardNumber(techDebtRoot)
  const filename = `h-${formatHazardNumber(n)}-${kebabTitle}.md`
  const statusDir = path.join(techDebtRoot, status)
  const filePath = path.join(statusDir, filename)

  if (options.dryRun) {
    console.log(`Would create: ${filePath}`)
    return
  }

  await mkdir(statusDir, { recursive: true })
  const content = generateTechDebtContent(title, { status, severity, category, reviewCadence })
  await writeFile(filePath, content, { flag: 'wx' }) // O_EXCL: fail if exists
  console.log(`Created: ${filePath}`)
}

async function handleList(options: TechDebtListOptions): Promise<void> {
  const cwd = options.cwd ?? process.cwd()
  const techDebtRoot = resolveTechDebtRoot(cwd)
  let items = scanTechDebtItems(techDebtRoot)

  if (options.status) {
    items = items.filter((item) => item.status === options.status)
  }
  if (options.severity) {
    items = items.filter((item) => item.severity === options.severity)
  }
  if (options.category) {
    items = items.filter((item) => item.category === options.category)
  }

  if (items.length === 0) {
    console.log(`No tech-debt items found (root: ${techDebtRoot})`)
    return
  }

  console.log(`Tech-debt items (${items.length}):`)
  for (const item of items) {
    const overdue = item.nextReview && new Date(item.nextReview) < new Date() ? ' [OVERDUE]' : ''
    const malformed = item.malformed ? ` [MALFORMED: ${item.malformed}]` : ''
    console.log(`  ${item.slug} [${item.status}] [${item.severity}]${overdue}${malformed}`)
    console.log(`    ${item.title}`)
  }
}

async function handleReview(options: TechDebtReviewOptions): Promise<void> {
  const cwd = options.cwd ?? process.cwd()
  const techDebtRoot = resolveTechDebtRoot(cwd)
  const items = scanTechDebtItems(techDebtRoot)
  const now = new Date()

  const overdueItems = items.filter(
    (item) => item.nextReview && new Date(item.nextReview) < now && !item.malformed,
  )

  if (overdueItems.length === 0) {
    console.log(`No overdue tech-debt reviews (root: ${techDebtRoot})`)
    return
  }

  console.log(`Overdue tech-debt reviews (${overdueItems.length}):`)
  for (const item of overdueItems) {
    console.log(
      `  ${item.slug} [${item.status}] [${item.severity}] next review: ${item.nextReview ?? 'unknown'}`,
    )
    console.log(`    ${item.title}`)
  }

  throw Object.assign(
    new Error(`${overdueItems.length} overdue tech-debt item(s) require review`),
    { exitCode: 1 },
  )
}

export async function executeTechDebtSubcommand(
  subcommand: string,
  args: string[],
  options: TechDebtCommandOptions,
): Promise<void> {
  switch (subcommand) {
    case 'new': {
      const title = args[0] ?? ''
      // --from-audit derives its own title; a user-supplied title is optional in that mode
      if (!title && !options.fromAudit) {
        throw new Error('Usage: ak tech-debt new "<title>" --severity <s> --category <c>')
      }
      await handleNew(title, options)
      return
    }
    case 'list': {
      await handleList(options)
      return
    }
    case 'review': {
      await handleReview(options)
      return
    }
    default: {
      throw new Error(
        `Unknown tech-debt subcommand: ${subcommand}\n\nUse one of: new, list, review`,
      )
    }
  }
}
