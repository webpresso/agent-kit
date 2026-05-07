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
 *
 * The `UNIFIED_CONSUMERS` registry below describes per-IDE projection of the
 * unified rule/skill content kinds (catalog ∪ consumer). Strategies:
 *   - 'symlink':   create a relative symlink to the source (file or dir)
 *   - 'copy':      copy file or recursively copy dir tree
 *   - 'transform': run a transform function over the body and write the
 *                  resulting bytes (used for Gemini TOML)
 */
import type { ContentKind, ContentRecord } from '../content/loader.js';
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
    /** Absolute or repoRoot-relative path to the source skill files (e.g. 'node_modules/@webpresso/agent-kit/skills'). When set, symlink targets resolve through this directory instead of `.agent/skills/`. */
    sourceRootDir?: string;
}
export declare const DEFAULT_PER_SKILL_CONSUMERS: PerSkillConsumerConfig[];
export type UnifiedStrategy = 'symlink' | 'copy' | 'transform';
export interface UnifiedTransformInput {
    readonly record: ContentRecord;
    readonly targetPath: string;
}
export interface UnifiedConsumerConfig {
    /** Human-readable id (used in logs and tests). */
    readonly id: string;
    /** Repo-root-relative directory that receives projected content. */
    readonly dir: string;
    /** Which content kind this consumer accepts (one entry per kind). */
    readonly acceptsKind: ContentKind;
    /** Projection strategy. */
    readonly strategy: UnifiedStrategy;
    /**
     * Output extension for rules (single-file). Default '.md'. Cursor uses
     * '.mdc'; Gemini uses '.toml'.
     */
    readonly ruleExtension?: string;
    /**
     * Optional transform applied when strategy is 'transform'. Receives the
     * record body and returns the bytes to write at targetPath.
     */
    readonly transform?: (input: UnifiedTransformInput) => string;
}
/**
 * Default-output filename for a rule record under a given consumer.
 * Pure helper — no I/O — so tests can assert it directly.
 */
export declare function unifiedRuleFilename(consumer: UnifiedConsumerConfig, slug: string): string;
/**
 * Default registry of unified consumers (rules + skills projection).
 *
 * Per the Wave 2 task plan:
 *   - `.agent/{rules,skills}/` (working dir): symlink, accepts rule + skill
 *   - `.cursor/rules/`: copy, accepts rule (Cursor follows symlinks unreliably)
 *   - `.windsurf/skills/`: copy, accepts skill
 *   - `.claude/skills/`: symlink, accepts rule (wrapped) + skill
 *   - `.gemini/commands/`: transform, accepts rule (workflows handled separately)
 *   - `.codex/agents/`: symlink, accepts rule + skill
 */
export declare const DEFAULT_UNIFIED_CONSUMERS: readonly UnifiedConsumerConfig[];
//# sourceMappingURL=consumers.d.ts.map