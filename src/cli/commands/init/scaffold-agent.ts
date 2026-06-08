/**
 * Copy `catalog/agent/` into the consumer's `.agent/`, honouring tier rules.
 *
 * Wave-3 narrowing: rules and skills are NO LONGER copied here. They flow
 * exclusively through the `agent-rules/` / `agent-skills/` consumer-owned
 * scaffolders + `runUnifiedSync` projection. This module now only handles
 * commands, workflows, guides, and the top-level catalog README.
 *
 * Skill-set exports remain because the init orchestrator uses them to compute
 * the allowed-skill set passed to the unified sync filter.
 *
 * - Shared favorites (fix, verify, testing-philosophy, plan-refine, pll,
 *   best-practice-research) —
 *   guaranteed across Codex + Claude by default.
 * - Shared add-ons (systematic-debugging, test-driven-development,
 *   deep-research) — opt-in.
 * - monorepo-navigation — rendered as a consumer-owned source skill, but not
 *   projected into host-visible surfaces unless explicitly opted in.
 * - Tier-3 — only on opt-in via --with / --all / interactive prompt.
 */
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'

import {
  copyDirectoryMerged,
  copyFileMerged,
  type MergeOptions,
  type MergeResult,
} from './merge.js'

export const SHARED_FAVORITE_SKILLS = [
  'fix',
  'verify',
  'testing-philosophy',
  'plan-refine',
  'pll',
  'best-practice-research',
] as const
export const TIER1_SKILLS = SHARED_FAVORITE_SKILLS

export const OPTIONAL_SHARED_SKILLS = [
  'systematic-debugging',
  'test-driven-development',
  'deep-research',
] as const
export const TIER2_SKILLS = OPTIONAL_SHARED_SKILLS

/** Rendered separately into agent-skills/, but projected only on explicit opt-in. */
export const RENDERED_SKILLS = ['monorepo-navigation'] as const

const NON_PROJECTED_SKILL_SLUGS = new Set<string>(['base-kit'])

export function isProjectedManagedSkillSlug(skillSlug: string): boolean {
  return !NON_PROJECTED_SKILL_SLUGS.has(skillSlug)
}

export function resolveManagedSkillSourceRoots(packageRoot: string): readonly string[] {
  return [join(packageRoot, 'catalog', 'agent', 'skills'), join(packageRoot, 'agent-skills')]
}

export function findManagedSkillSource(packageRoot: string, skillSlug: string): string | null {
  for (const root of resolveManagedSkillSourceRoots(packageRoot)) {
    const skillPath = join(root, skillSlug, 'SKILL.md')
    if (existsSync(skillPath)) return skillPath
  }
  return null
}

export function findMissingManagedSkillSources(
  packageRootOrCatalogDir: string,
  skillSlugs: readonly string[],
): string[] {
  const packageRoot = packageRootOrCatalogDir.endsWith('/catalog')
    ? dirname(packageRootOrCatalogDir)
    : packageRootOrCatalogDir
  return [...new Set(skillSlugs)].filter((skillSlug) => !findManagedSkillSource(packageRoot, skillSlug))
}

export function assertManagedSkillSourcesPresent(
  packageRootOrCatalogDir: string,
  skillSlugs: readonly string[],
): void {
  const missing = findMissingManagedSkillSources(packageRootOrCatalogDir, skillSlugs)
  if (missing.length === 0) return

  throw new Error(
    `wp init: missing canonical skill source(s): ${missing.join(', ')}. ` +
      'Expected each selected/shared skill under catalog/agent/skills/<slug>/SKILL.md ' +
      'or agent-skills/<slug>/SKILL.md in the agent-kit package root.',
  )
}

export interface ScaffoldAgentInput {
  catalogDir: string
  repoRoot: string
  options: MergeOptions
}

export interface ScaffoldAgentReport {
  results: MergeResult[]
}

const ALWAYS_COPY_SUBDIRS = ['commands', 'workflows', 'guides'] as const

const GENERATED_WHOLE_FILE: MergeOptions = { ownership: 'generated-whole-file' }

/** Top-level catalog files emitted once on fresh setup (never overwritten). */
const FRESH_COPY_FILES = ['correlate.allow.yaml'] as const

export function scaffoldAgent(input: ScaffoldAgentInput): ScaffoldAgentReport {
  const { catalogDir, repoRoot, options } = input
  const catalogAgent = join(catalogDir, 'agent')
  const targetAgent = join(repoRoot, '.agent')
  const results: MergeResult[] = []

  for (const subdir of ALWAYS_COPY_SUBDIRS) {
    const src = join(catalogAgent, subdir)
    const dst = join(targetAgent, subdir)
    if (existsSync(src)) {
      results.push(...copyDirectoryMerged(src, dst, { ...options, ...GENERATED_WHOLE_FILE }))
    }
  }

  // Top-level catalog README is a generated surface owned by webpresso.
  const topReadme = join(catalogAgent, 'README.md')
  if (existsSync(topReadme)) {
    results.push(
      copyFileMerged(topReadme, join(targetAgent, 'README.md'), {
        ...options,
        ...GENERATED_WHOLE_FILE,
      }),
    )
  }

  // Fresh-only top-level files — emitted once to the consumer's .agent/.
  // These are committed to the consumer repo (not gitignored) so cloud agents
  // and CI can read them. Only written on first setup (absent = fresh).
  for (const file of FRESH_COPY_FILES) {
    const src = join(catalogAgent, file)
    if (existsSync(src)) {
      results.push(copyFileMerged(src, join(targetAgent, file), options))
    }
  }

  return { results }
}
