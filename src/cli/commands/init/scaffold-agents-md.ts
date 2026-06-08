import type { AgentkitConfig } from './config.js'
import type { ConsumerContext } from './detect-consumer.js'

/**
 * Render `catalog/AGENTS.md.tpl` into the consumer's `AGENTS.md`.
 *
 * Placeholders:
 * - {{REPOSITORY_MAP}}: bulleted list of workspace packages, or "single-package" fallback.
 * - {{TECH_STACK}}: detected from package.json deps.
 * - {{ESCALATION_MAP}}: TODO placeholder.
 * - {{DURABLE_PLANNING_ROOT}}: from .webpressorc.json, defaulting to `.agent/planning/`.
 * - {{BLUEPRINTS_DIR}}: from .webpressorc.json, defaulting to `blueprints`.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { DEFAULT_DURABLE_PLANNING_ROOT } from './config.js'
import { type MergeOptions, type MergeResult, writeFileMerged } from './merge.js'

const TECH_STACK_RULES: Array<{ dep: RegExp; label: string }> = [
  { dep: /^react(-dom)?$/, label: 'React' },
  { dep: /^next$/, label: 'Next.js' },
  { dep: /^@remix-run\//, label: 'Remix' },
  { dep: /^@tanstack\/react-query$/, label: 'TanStack Query' },
  { dep: /^hono$/, label: 'Hono' },
  { dep: /^drizzle-orm$/, label: 'Drizzle ORM' },
  { dep: /^@cloudflare\/workers-types$/, label: 'Cloudflare Workers' },
  { dep: /^wrangler$/, label: 'Cloudflare Workers (wrangler)' },
  { dep: /^pg$|^postgres$|^@neondatabase\//, label: 'PostgreSQL' },
  { dep: /^better-auth$/, label: 'better-auth' },
  { dep: /^vitest$/, label: 'Vitest' },
  { dep: /^@playwright\/test$/, label: 'Playwright' },
  { dep: /^zod$/, label: 'Zod' },
  { dep: /^typescript$/, label: 'TypeScript' },
]

export const AGENTS_MD_MAX_BYTES = 8_000

export function renderRepositoryMap(consumer: ConsumerContext): string {
  const packages = consumer.workspacePackages
  if (packages.length === 0) {
    const name = consumer.packageJson?.name ?? 'this project'
    return `Single-package project: \`${name}\` (root: \`${consumer.repoRoot}\`).`
  }
  return packages.map((p) => `- \`${p.name}\` — \`${p.relativePath}\``).join('\n')
}

export function renderTechStack(consumer: ConsumerContext): string {
  const deps = {
    ...consumer.packageJson?.dependencies,
    ...consumer.packageJson?.devDependencies,
  }
  const depNames = Object.keys(deps)
  const matches = new Set<string>()
  for (const name of depNames) {
    for (const rule of TECH_STACK_RULES) {
      if (rule.dep.test(name)) matches.add(rule.label)
    }
  }
  if (matches.size === 0) {
    return '{{TODO: list the tech stack (frameworks, DB, runtime) for this repo.}}'
  }
  return Array.from(matches)
    .toSorted()
    .map((label) => `- ${label}`)
    .join('\n')
}

export interface ScaffoldAgentsMdInput {
  catalogDir: string
  repoRoot: string
  consumer: ConsumerContext
  config: AgentkitConfig
  options: MergeOptions
}

type AgentsBlockKind = 'managed' | 'user'

interface AgentsBlock {
  kind: AgentsBlockKind
  id: string
  startLine: number
  endLine: number
  innerLines: string[]
}

const MANAGED_BEGIN = /^<!-- >>> managed by webpresso \(([^)]+)\) -->$/u
const MANAGED_END = /^<!-- <<< managed by webpresso \(([^)]+)\) -->$/u
const USER_BEGIN = /^<!-- >>> user-owned \(([^)]+)\) -->$/u
const USER_END = /^<!-- <<< user-owned \(([^)]+)\) -->$/u

function parseAgentsBlocks(content: string): AgentsBlock[] {
  const lines = content.split('\n')
  const blocks: AgentsBlock[] = []
  let cursor = 0

  while (cursor < lines.length) {
    const line = lines[cursor] ?? ''
    const managedStart = MANAGED_BEGIN.exec(line)
    const userStart = USER_BEGIN.exec(line)

    if (!managedStart && !userStart) {
      cursor += 1
      continue
    }

    const kind: AgentsBlockKind = managedStart ? 'managed' : 'user'
    const id = managedStart?.[1] ?? userStart?.[1]
    const endMatcher = kind === 'managed' ? MANAGED_END : USER_END
    let endLine = cursor + 1
    while (endLine < lines.length && !endMatcher.test(lines[endLine] ?? '')) {
      endLine += 1
    }
    if (!id || endLine >= lines.length) {
      cursor += 1
      continue
    }

    blocks.push({
      kind,
      id,
      startLine: cursor,
      endLine,
      innerLines: lines.slice(cursor + 1, endLine),
    })
    cursor = endLine + 1
  }

  return blocks
}

function renderBlock(
  kind: AgentsBlockKind,
  id: string,
  innerLines: readonly string[],
): readonly string[] {
  const begin =
    kind === 'managed'
      ? `<!-- >>> managed by webpresso (${id}) -->`
      : `<!-- >>> user-owned (${id}) -->`
  const end =
    kind === 'managed'
      ? `<!-- <<< managed by webpresso (${id}) -->`
      : `<!-- <<< user-owned (${id}) -->`
  return [begin, ...innerLines, end]
}

export function mergeRenderedAgentsMd(rendered: string, existing: string): string | null {
  const renderedBlocks = parseAgentsBlocks(rendered)
  const existingBlocks = parseAgentsBlocks(existing)
  if (renderedBlocks.length === 0 || existingBlocks.length === 0) return null

  const existingUserBlocks = new Map(
    existingBlocks
      .filter((block) => block.kind === 'user')
      .map((block) => [block.id, block.innerLines] as const),
  )

  const lines = rendered.split('\n')
  const replacements = renderedBlocks
    .filter((block) => block.kind === 'user')
    .map((block) => ({
      ...block,
      replacement: renderBlock(
        'user',
        block.id,
        existingUserBlocks.get(block.id) ?? block.innerLines,
      ),
    }))
    .toReversed()

  for (const block of replacements) {
    lines.splice(block.startLine, block.endLine - block.startLine + 1, ...block.replacement)
  }

  return lines.join('\n')
}

function writeAgentsMdManaged(
  targetPath: string,
  rendered: string,
  opts: MergeOptions = {},
): MergeResult {
  const exists = existsSync(targetPath)
  if (!exists) {
    if (opts.dryRun) return { targetPath, action: 'skipped-dry' }
    mkdirSync(dirname(targetPath), { recursive: true })
    writeFileSync(targetPath, rendered)
    return { targetPath, action: 'created' }
  }

  const existing = readFileSync(targetPath, 'utf8')
  if (existing === rendered) return { targetPath, action: 'identical' }

  const merged = mergeRenderedAgentsMd(rendered, existing)
  if (merged === null) {
    return writeFileMerged(targetPath, rendered, opts)
  }
  if (merged === existing) return { targetPath, action: 'identical' }
  if (opts.dryRun) return { targetPath, action: 'skipped-dry' }

  writeFileSync(targetPath, merged)
  return { targetPath, action: 'overwritten' }
}

function withTrailingSlash(path: string): string {
  return path.endsWith('/') ? path : `${path}/`
}

function withoutTrailingSlash(path: string): string {
  return path.replace(/\/+$/u, '')
}

export function renderAgentsMd(
  template: string,
  consumer: ConsumerContext,
  config: AgentkitConfig,
): string {
  const durablePlanningRoot = withTrailingSlash(
    config.durablePlanningRoot || DEFAULT_DURABLE_PLANNING_ROOT,
  )
  const replacements: Record<string, string> = {
    '{{REPOSITORY_MAP}}': renderRepositoryMap(consumer),
    '{{TECH_STACK}}': renderTechStack(consumer),
    '{{ESCALATION_MAP}}': '{{TODO: populate escalation map — who to ping for which subsystem.}}',
    '{{DURABLE_PLANNING_ROOT}}': durablePlanningRoot,
    '{{BLUEPRINTS_DIR}}': withoutTrailingSlash(config.blueprintsDir ?? 'blueprints'),
  }
  let output = template
  for (const [key, value] of Object.entries(replacements)) {
    output = output.split(key).join(value)
  }
  return output
}

export function scaffoldAgentsMd(input: ScaffoldAgentsMdInput): MergeResult | null {
  const { catalogDir, repoRoot, consumer, config, options } = input
  const tplPath = join(catalogDir, 'AGENTS.md.tpl')
  if (!existsSync(tplPath)) return null
  const template = readFileSync(tplPath, 'utf8')
  const rendered = renderAgentsMd(template, consumer, config)
  const target = join(repoRoot, 'AGENTS.md')
  return writeAgentsMdManaged(target, rendered, options)
}
