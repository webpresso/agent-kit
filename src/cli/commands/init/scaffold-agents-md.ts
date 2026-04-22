import type { AgentkitConfig } from './config.js'
import type { ConsumerContext } from './detect-consumer.js'

/**
 * Render `catalog/AGENTS.md.tpl` into the consumer's `AGENTS.md`.
 *
 * Placeholders:
 * - {{REPOSITORY_MAP}}: bulleted list of workspace packages, or "single-package" fallback.
 * - {{TECH_STACK}}: detected from package.json deps.
 * - {{ESCALATION_MAP}}: TODO placeholder.
 * - {{DURABLE_PLANNING_ROOT}}: from .agent-kitrc.json, defaulting to `.agent/planning/`.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

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

export function renderAgentsMd(
  template: string,
  consumer: ConsumerContext,
  config: AgentkitConfig,
): string {
  const replacements: Record<string, string> = {
    '{{REPOSITORY_MAP}}': renderRepositoryMap(consumer),
    '{{TECH_STACK}}': renderTechStack(consumer),
    '{{ESCALATION_MAP}}': '{{TODO: populate escalation map — who to ping for which subsystem.}}',
    '{{DURABLE_PLANNING_ROOT}}': config.durablePlanningRoot || DEFAULT_DURABLE_PLANNING_ROOT,
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
  return writeFileMerged(target, rendered, options)
}
