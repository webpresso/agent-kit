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
    dir: string;
    sourcePrefix: string;
}
export declare const DEFAULT_CONSUMERS: ConsumerConfig[];
export declare const ALLOWED_REAL_FILES: Set<string>;
export interface SkillsConsumerConfig {
    linkPath: string;
    target: string;
}
export declare const DEFAULT_SKILLS_CONSUMERS: SkillsConsumerConfig[];
/**
 * Per-skill consumer — creates one symlink per entry in `.agent/skills/`,
 * instead of a single directory-symlink. Use this for consumers whose
 * skills directory mixes agent-kit skills with third-party skills that
 * must be preserved.
 */
export interface PerSkillConsumerConfig {
    dir: string;
    sourcePrefix: string;
}
export declare const DEFAULT_PER_SKILL_CONSUMERS: PerSkillConsumerConfig[];
//# sourceMappingURL=consumers.d.ts.map