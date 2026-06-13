/**
 * Default consumer configurations for the symlinker.
 *
 * Consumers are tool-specific directories that mirror the canonical source of
 * truth under `.agent/` via symlinks. Each consumer entry describes a single
 * directory and the relative prefix used when creating symlinks from that
 * directory back into `.agent/`.
 *
 * Primary IDEs (Claude Code, Codex, Cursor, Windsurf, OpenCode) are handled by
 * their documented native surfaces. Skill delivery is **one channel per host**:
 *   - Claude Code skills: the Claude Code **plugin** (`agent-kit@webpresso`).
 *     `.claude/skills/` is NOT projected for Claude — that would double-show
 *     every skill (namespaced `agent-kit:*` from the plugin AND bare from the
 *     symlink). Only projected as a fallback when the plugin is opted out
 *     (`WP_SKIP_CLAUDE_PLUGIN=1`).
 *   - Codex skills: the Codex **plugin** (`codex plugin add agent-kit@webpresso`).
 *     `.agents/skills/` is NOT projected for Codex — Codex does not dedupe
 *     skills by name, so plugin + `.agents/skills/` would double-show. Only
 *     projected as a fallback when the plugin is opted out
 *     (`WP_SKIP_CODEX_PLUGIN=1`). `.codex/agents/` is not a skill root.
 *   - OpenCode skills: `.opencode/skills/` — OpenCode's primary skill root.
 *     OpenCode also reads `.claude/skills/` and `.agents/skills/` as fallbacks,
 *     but agent-kit projects only the primary `.opencode/skills/` so the same
 *     skill is not surfaced twice.
 *   - Cursor / Windsurf: webpresso-localskills-distribution (localskills.sh)
 *     plus copied rules/skills below where the tools need project files.
 *
 * Skill-dir projection is **host-gated** via `selectUnifiedConsumers(hosts)`:
 * a consumer bound to a host is included only when that host is in
 * `hosts.selected`, and a plugin host (Claude, Codex) contributes no skill dir
 * unless its plugin is opted out. Rules and the canonical `.agent/{rules,skills}`
 * SSOT are always projected.
 *
 * The `UNIFIED_CONSUMERS` registry below describes per-IDE projection of the
 * unified rule/skill content kinds (catalog ∪ consumer). Strategies:
 *   - 'symlink':   create a relative symlink to the source (file or dir)
 *   - 'copy':      copy file or recursively copy dir tree
 *   - 'transform': run a transform function over the body and write the
 *                  resulting bytes (used for Gemini TOML)
 */

import type { ContentKind, ContentRecord } from '#content/loader'

export interface ConsumerConfig {
  dir: string
  sourcePrefix: string
}

export const DEFAULT_CONSUMERS: ConsumerConfig[] = [
  // Primary IDEs removed — distributed via native channels (plugin / localskills.sh).
  // Intentionally NOT mapped: `.codex/prompts/`. OpenAI deprecated Codex
  // custom prompts in favour of skills, and the surface was home-only
  // (~/.codex/prompts/) even before deprecation — project-local
  // `.codex/prompts/` is never discovered by Codex.
  // See https://developers.openai.com/codex/custom-prompts
]

export const ALLOWED_REAL_FILES = new Set(['README.md', '.markdownlint.json'])

export interface SkillsConsumerConfig {
  linkPath: string
  target: string
}

export const DEFAULT_SKILLS_CONSUMERS: SkillsConsumerConfig[] = [
  // .claude/skills removed — covered by the Claude Code plugin (primary channel).
]

/**
 * Per-skill consumer — creates one directory symlink per skill in
 * `.agent/skills/`, instead of a single skills-root symlink. Codex documents
 * symlinked skill folders as a supported discovery shape.
 *
 * Source-of-truth is `.agent/skills/<slug>/` — the consumer projection
 * produced by `runUnifiedSync`.
 */
export interface PerSkillConsumerConfig {
  dir: string
}

export const DEFAULT_PER_SKILL_CONSUMERS: PerSkillConsumerConfig[] = [
  {
    dir: '.agents/skills',
  },
]

// ---------------------------------------------------------------------------
// Unified consumer registry — per-IDE projection of unified rule/skill content
// ---------------------------------------------------------------------------

export type UnifiedStrategy = 'symlink' | 'copy' | 'transform'

export interface UnifiedTransformInput {
  readonly record: ContentRecord
  readonly targetPath: string
}

export interface UnifiedConsumerConfig {
  /** Human-readable id (used in logs and tests). */
  readonly id: string
  /** Repo-root-relative directory that receives projected content. */
  readonly dir: string
  /** Which content kind this consumer accepts (one entry per kind). */
  readonly acceptsKind: ContentKind
  /** Projection strategy. */
  readonly strategy: UnifiedStrategy
  /**
   * Output extension for rules (single-file). Default '.md'. Cursor uses
   * '.mdc'; Gemini uses '.toml'.
   */
  readonly ruleExtension?: string
  /**
   * Optional transform applied when strategy is 'transform'. Receives the
   * record body and returns the bytes to write at targetPath.
   */
  readonly transform?: (input: UnifiedTransformInput) => string
  /**
   * Agent host this consumer's directory belongs to. When set, the consumer is
   * projected only if the host is selected (see `selectUnifiedConsumers`).
   * Omitted for host-agnostic surfaces (the canonical `.agent/` SSOT, Cursor
   * rules, Windsurf skills) which always project.
   */
  readonly host?: AgentHostName
  /**
   * When true, the host receives skills through a native plugin, so this
   * skill-dir consumer is a fallback that projects only when the plugin is
   * opted out (`WP_SKIP_<HOST>_PLUGIN=1`).
   */
  readonly pluginHost?: boolean
}

/**
 * Agent host names that can own a unified consumer. Kept as a local string
 * union (not imported from the CLI layer) so `src/symlinker` does not depend on
 * `src/cli`, which would create an import cycle (init → unified-sync → cli).
 */
export type AgentHostName = 'codex' | 'claude' | 'opencode'

/**
 * Env var whose value `'1'` opts a plugin host out of plugin-based skill
 * delivery, re-enabling its skill-dir fallback consumer.
 */
export const PLUGIN_SKILL_HOST_ENV = {
  claude: 'WP_SKIP_CLAUDE_PLUGIN',
  codex: 'WP_SKIP_CODEX_PLUGIN',
} as const satisfies Partial<Record<AgentHostName, string>>

/**
 * Default-output filename for a rule record under a given consumer.
 * Pure helper — no I/O — so tests can assert it directly.
 */
export function unifiedRuleFilename(consumer: UnifiedConsumerConfig, slug: string): string {
  const ext = consumer.ruleExtension ?? '.md'
  return `${slug}${ext}`
}

/**
 * Default registry of unified consumers (rules + skills projection).
 *
 * Host-agnostic surfaces always project; host-bound skill surfaces are gated by
 * `selectUnifiedConsumers(hosts)`:
 *   - `.agent/{rules,skills}/` (working dir, SSOT): symlink, always
 *   - `.cursor/rules/`: copy, always (Cursor follows symlinks unreliably)
 *   - `.windsurf/skills/`: copy, always
 *   - `.claude/rules/`: symlink, always (rules are not plugin-delivered)
 *   - `.opencode/skills/`: symlink, host `opencode` (OpenCode's primary root)
 *
 * Plugin-delivered hosts get NO skill dir here — see
 * `PLUGIN_FALLBACK_SKILL_CONSUMERS` for the opt-out fallback. Codex has no
 * `.codex/agents/` consumer; official Codex skill discovery is the plugin plus
 * `.agents/skills/`, `~/.agents/skills`, `/etc/codex/skills`.
 */
export const DEFAULT_UNIFIED_CONSUMERS: readonly UnifiedConsumerConfig[] = [
  // Working dir: split into rules/ and skills/ siblings under .agent/ (SSOT).
  { id: 'agent-rules', dir: '.agent/rules', acceptsKind: 'rule', strategy: 'symlink' },
  { id: 'agent-skills', dir: '.agent/skills', acceptsKind: 'skill', strategy: 'symlink' },
  // Cursor: rules only, copy, .mdc extension
  {
    id: 'cursor-rules',
    dir: '.cursor/rules',
    acceptsKind: 'rule',
    strategy: 'copy',
    ruleExtension: '.mdc',
  },
  // Windsurf: skills only, copy
  { id: 'windsurf-skills', dir: '.windsurf/skills', acceptsKind: 'skill', strategy: 'copy' },
  // Claude: rules are scaffolded to .claude/rules; skills come from the plugin.
  { id: 'claude-rules', dir: '.claude/rules', acceptsKind: 'rule', strategy: 'symlink' },
  // OpenCode: skills via its primary `.opencode/skills/` root (host-gated).
  {
    id: 'opencode-skills',
    dir: '.opencode/skills',
    acceptsKind: 'skill',
    strategy: 'symlink',
    host: 'opencode',
  },
] as const

/**
 * Skill-dir consumers for hosts whose skills are normally delivered by a native
 * plugin (Claude, Codex). These project ONLY when the host is selected AND its
 * plugin is opted out (`WP_SKIP_CLAUDE_PLUGIN=1` / `WP_SKIP_CODEX_PLUGIN=1`).
 * Without the opt-out, projecting these would double-show every skill alongside
 * the plugin (Codex does not dedupe skills by name).
 */
export const PLUGIN_FALLBACK_SKILL_CONSUMERS: readonly UnifiedConsumerConfig[] = [
  {
    id: 'claude-skills',
    dir: '.claude/skills',
    acceptsKind: 'skill',
    strategy: 'symlink',
    host: 'claude',
    pluginHost: true,
  },
  {
    id: 'portable-skills',
    dir: '.agents/skills',
    acceptsKind: 'skill',
    strategy: 'symlink',
    host: 'codex',
    pluginHost: true,
  },
] as const

/**
 * Resolve the active unified-consumer set for the selected hosts.
 *
 * - Host-agnostic consumers (`host === undefined`) always project.
 * - Host-bound consumers project only when the host is selected.
 * - Plugin-host skill-dir fallbacks project only when the host is selected AND
 *   its plugin is opted out via env.
 *
 * `hosts === undefined` (e.g. a worktree with no config) yields the safe
 * plugin-first default: canonical SSOT + rules, but no host skill dirs.
 */
export function selectUnifiedConsumers(
  hosts: readonly string[] | undefined,
  env: NodeJS.ProcessEnv = process.env,
): readonly UnifiedConsumerConfig[] {
  const selected = new Set(hosts ?? [])
  const base = DEFAULT_UNIFIED_CONSUMERS.filter((c) => c.host === undefined || selected.has(c.host))
  const envByHost: Record<string, string | undefined> = PLUGIN_SKILL_HOST_ENV
  const fallbacks = PLUGIN_FALLBACK_SKILL_CONSUMERS.filter((c) => {
    if (c.host === undefined || !selected.has(c.host)) return false
    const envVar = envByHost[c.host]
    return envVar !== undefined && env[envVar] === '1'
  })
  return [...base, ...fallbacks]
}
