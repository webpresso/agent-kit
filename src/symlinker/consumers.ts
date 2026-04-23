/**
 * Default consumer configurations for the symlinker.
 *
 * Consumers are tool-specific directories (e.g. `.claude/commands/`) that
 * mirror the canonical source of truth under `.agent/` via symlinks. Each
 * consumer entry describes a single directory and the relative prefix used
 * when creating symlinks from that directory back into `.agent/`.
 *
 * These defaults are intentionally conservative: only tools whose command
 * surface accepts the same markdown symlink pattern as Claude Code are
 * included. Gemini's TOML surface is handled separately by
 * `syncGeminiCommands` (not symlink-based).
 */

export interface ConsumerConfig {
  dir: string
  sourcePrefix: string
}

export const DEFAULT_CONSUMERS: ConsumerConfig[] = [
  { dir: '.claude/commands', sourcePrefix: '../../.agent/' },
  // Cursor and Windsurf support .md files under .{tool}/commands/
  // (same symlink pattern as Claude Code). Safe to add by default.
  { dir: '.cursor/commands', sourcePrefix: '../../.agent/' },
  { dir: '.windsurf/commands', sourcePrefix: '../../.agent/' },
  // OpenCode uses `.opencode/commands/*.md` (plural) for project-level
  // slash commands — same markdown + YAML-frontmatter shape as Claude.
  { dir: '.opencode/commands', sourcePrefix: '../../.agent/' },
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
  { linkPath: '.claude/skills', target: '../.agent/skills' },
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
}

export const DEFAULT_PER_SKILL_CONSUMERS: PerSkillConsumerConfig[] = [
  // `.agents/skills/` is the convergent project-skills path for:
  //   - Codex (official): scanned CWD → repo root per OpenAI's docs at
  //     https://developers.openai.com/codex/skills → "Where to save skills"
  //   - Amp / Sourcegraph (official): committed project skills per
  //     https://ampcode.com/manual → Agent Skills
  //   - OpenCode (fallback): discovered alongside `.opencode/skills/` per
  //     https://opencode.ai/docs/skills/ → Place files
  // One per-skill surface covers three tools with zero per-tool specials.
  //
  // Deliberately NOT mapped:
  //   - `.codex/skills/`: a third-party tool (github.com/luongnv89/asm)
  //     lists this path, but OpenAI's own docs show Codex only reads
  //     `.agents/skills/` project-local.
  //   - `.opencode/skills/`: redundant; OpenCode reads `.claude/skills/`
  //     and `.agents/skills/` as project-local fallbacks, so the
  //     `.claude/skills` directory-symlink and the `.agents/skills/`
  //     per-skill entry below already cover it.
  { dir: '.agents/skills', sourcePrefix: '../../.agent/skills/' },
]
