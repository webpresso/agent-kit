/**
 * Default consumer configurations for the symlinker.
 *
 * Consumers are tool-specific directories that mirror the canonical source of
 * truth under `.agent/` via symlinks. Each consumer entry describes a single
 * directory and the relative prefix used when creating symlinks from that
 * directory back into `.agent/`.
 *
 * Primary IDEs (Claude Code, Cursor, Windsurf, OpenCode) are no longer handled
 * by the symlinker — they distribute skills via native channels:
 *   - Claude Code: agent-kit-as-claude-code-plugin (marketplace plugin)
 *   - Cursor / Windsurf: agent-kit-localskills-distribution (localskills.sh)
 *   - OpenCode: falls back to `.claude/skills/` covered by the Claude Code plugin
 *
 * Gemini's TOML surface is handled separately by `syncGeminiCommands`
 * (not symlink-based).
 */

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
 * Per-skill consumer — creates one symlink per entry in `.agent/skills/`,
 * instead of a single directory-symlink. Use this for consumers whose
 * skills directory mixes agent-kit skills with third-party skills that
 * must be preserved.
 */
export interface PerSkillConsumerConfig {
  dir: string
  sourcePrefix: string
  /** Absolute or repoRoot-relative path to the source skill files (e.g. 'node_modules/@webpresso/agent-kit/skills'). When set, symlink targets resolve through this directory instead of `.agent/skills/`. */
  sourceRootDir?: string
}

export const DEFAULT_PER_SKILL_CONSUMERS: PerSkillConsumerConfig[] = [
  { dir: '.agents/skills', sourcePrefix: '../../.agent/skills/', sourceRootDir: 'node_modules/@webpresso/agent-kit/skills' },
]
