import type { ConsumerContext, WorkspacePackageInfo } from './detect-consumer.js'

/**
 * Render `catalog/agent/skills/monorepo-navigation/SKILL.md.tpl` into the
 * consumer-owned `agent-skills/monorepo-navigation/SKILL.md`, filling in
 * placeholders with workspace introspection. Unified sync projects it into
 * generated host surfaces. Copy the `examples/` directory verbatim.
 */
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, join } from 'node:path'

import {
  copyDirectoryMerged,
  type MergeOptions,
  type MergeResult,
  writeFileMerged,
} from './merge.js'

export interface ScaffoldMonorepoNavInput {
  catalogDir: string
  repoRoot: string
  consumer: ConsumerContext
  options: MergeOptions
}

export function renderPackagesTable(packages: readonly WorkspacePackageInfo[]): string {
  if (packages.length === 0) {
    return 'This repo is a single-package project.'
  }
  const header =
    '| Package | Path | Purpose | Common Files |\n| ------- | ---- | ------- | ------------ |'
  const rows = packages.map(
    (p) =>
      `| \`${p.name}\` | \`${p.relativePath}\` | {{TODO: describe}} | {{TODO: common files}} |`,
  )
  return [header, ...rows].join('\n')
}

/**
 * Infer coarse key locations from package naming. Always leaves a TODO so
 * the human can refine. Never fabricates paths — only reports what we saw.
 */
export function renderKeyLocations(packages: readonly WorkspacePackageInfo[]): string {
  if (packages.length === 0) {
    return '{{TODO: populate this section — list the typical file roots in your project.}}'
  }
  const bullets: string[] = []
  for (const pkg of packages) {
    const lower = pkg.name.toLowerCase()
    if (lower.endsWith('-api') || lower.endsWith('/api')) {
      bullets.push(
        `- **API routes** (${pkg.name}): look in \`${pkg.relativePath}/src/routes/\` or \`${pkg.relativePath}/src/handlers/\``,
      )
    }
    if (lower.includes('ui') || lower.includes('components')) {
      bullets.push(
        `- **Components** (${pkg.name}): look in \`${pkg.relativePath}/src/components/\``,
      )
    }
    if (lower.includes('database') || lower.includes('db')) {
      bullets.push(
        `- **Database schemas** (${pkg.name}): look in \`${pkg.relativePath}/src/schemas/\` or \`${pkg.relativePath}/migrations/\``,
      )
    }
    if (lower.includes('test-utils') || lower.includes('testing')) {
      bullets.push(`- **Test utilities** (${pkg.name}): \`${pkg.relativePath}\``)
    }
  }
  if (bullets.length === 0) {
    return '{{TODO: populate this section — list the typical file roots in your project.}}'
  }
  bullets.push('', '{{TODO: refine — the above is heuristic. Add project-specific locations.}}')
  return bullets.join('\n')
}

export function renderCrossPackageImports(packages: readonly WorkspacePackageInfo[]): string {
  if (packages.length === 0) {
    return '{{TODO: document cross-package imports if this repo later becomes a monorepo.}}'
  }
  const lines: string[] = ['```typescript']
  for (const pkg of packages.slice(0, 6)) {
    lines.push(`import { /* ... */ } from '${pkg.name}'`)
  }
  lines.push('```')
  return lines.join('\n')
}

export function renderPackageNames(packages: readonly WorkspacePackageInfo[]): string {
  if (packages.length === 0) return '_n/a — single-package project_'
  const lines: string[] = []
  for (const pkg of packages) {
    lines.push(`- \`${pkg.shortName}\` → \`${pkg.name}\``)
  }
  return lines.join('\n')
}

export function renderTemplate(template: string, consumer: ConsumerContext): string {
  const projectName = consumer.packageJson?.name ?? basename(consumer.repoRoot)
  const replacements: Record<string, string> = {
    '{{PROJECT_NAME}}': projectName,
    '{{PACKAGES_TABLE}}': renderPackagesTable(consumer.workspacePackages),
    '{{KEY_LOCATIONS}}': renderKeyLocations(consumer.workspacePackages),
    '{{CROSS_PACKAGE_IMPORTS}}': renderCrossPackageImports(consumer.workspacePackages),
    '{{PACKAGE_NAMES}}': renderPackageNames(consumer.workspacePackages),
  }
  let output = template
  for (const [key, value] of Object.entries(replacements)) {
    // Replace all occurrences without regex escaping headaches.
    output = output.split(key).join(value)
  }
  return output
}

export function scaffoldMonorepoNav(input: ScaffoldMonorepoNavInput): MergeResult[] {
  const { catalogDir, repoRoot, consumer, options } = input
  const skillSrc = join(catalogDir, 'agent', 'skills', 'monorepo-navigation')
  const skillDst = join(repoRoot, 'agent-skills', 'monorepo-navigation')
  const results: MergeResult[] = []

  const tplPath = join(skillSrc, 'SKILL.md.tpl')
  if (!existsSync(tplPath)) return results

  const template = readFileSync(tplPath, 'utf8')
  const rendered = renderTemplate(template, consumer)
  results.push(writeFileMerged(join(skillDst, 'SKILL.md'), rendered, options))

  const examplesSrc = join(skillSrc, 'examples')
  if (existsSync(examplesSrc) && statSync(examplesSrc).isDirectory()) {
    results.push(...copyDirectoryMerged(examplesSrc, join(skillDst, 'examples'), options))
  }
  return results
}
