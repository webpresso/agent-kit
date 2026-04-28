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
export const DEFAULT_CONSUMERS = [
// Primary IDEs removed — distributed via native channels (plugin / localskills.sh).
// Intentionally NOT mapped: `.codex/prompts/`. OpenAI deprecated Codex
// custom prompts in favour of skills, and the surface was home-only
// (~/.codex/prompts/) even before deprecation — project-local
// `.codex/prompts/` is never discovered by Codex.
// See https://developers.openai.com/codex/custom-prompts
];
export const ALLOWED_REAL_FILES = new Set(['README.md', '.markdownlint.json']);
export const DEFAULT_SKILLS_CONSUMERS = [
// .claude/skills removed — covered by the Claude Code plugin (primary channel).
];
export const DEFAULT_PER_SKILL_CONSUMERS = [
    { dir: '.agents/skills', sourcePrefix: '../../.agent/skills/', sourceRootDir: 'node_modules/@webpresso/agent-kit/skills' },
];
//# sourceMappingURL=consumers.js.map