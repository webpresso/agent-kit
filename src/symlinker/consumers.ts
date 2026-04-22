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
]

export const ALLOWED_REAL_FILES = new Set(['README.md', '.markdownlint.json'])

export interface SkillsConsumerConfig {
  linkPath: string
  target: string
}

export const DEFAULT_SKILLS_CONSUMERS: SkillsConsumerConfig[] = [
  { linkPath: '.claude/skills', target: '../.agent/skills' },
]
