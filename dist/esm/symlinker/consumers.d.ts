/**
 * Default consumer configurations for the symlinker.
 *
 * Consumers are tool-specific directories that mirror the canonical source of
 * truth under `.agent/` via symlinks. Each consumer entry describes a single
 * directory and the relative prefix used when creating symlinks from that
 * directory back into `.agent/`.
 *
 * Primary IDEs (Claude Code, Codex, Cursor, Windsurf, OpenCode) are handled by
 * their documented native surfaces:
 *   - Codex skills: `.agents/skills/` (plus user/global roots), covered by
 *     DEFAULT_UNIFIED_CONSUMERS. `.codex/agents/` is not a skill root.
 *   - Claude Code skills: `.claude/skills/` and plugin distribution.
 *   - Cursor / Windsurf: webpresso-localskills-distribution (localskills.sh)
 *     plus copied rules/skills below where the tools need project files.
 *   - OpenCode skills: `.opencode/skills/`, `.claude/skills/`, and
 *     `.agents/skills/`. Agent-kit writes `.agents/skills/` and `.claude/skills/`
 *     so OpenCode sees the same core capabilities without extra aliases.
 *     Rules surface: opencode reads `AGENTS.md` directly from the repo root; no
 *     symlinker consumer needed.
 *
 * The `UNIFIED_CONSUMERS` registry below describes per-IDE projection of the
 * unified rule/skill content kinds (catalog ∪ consumer). Strategies:
 *   - 'symlink':   create a relative symlink to the source (file or dir)
 *   - 'copy':      copy file or recursively copy dir tree
 *   - 'transform': run a transform function over the body and write the
 *                  resulting bytes (used for Gemini TOML)
 */
import type { ContentKind, ContentRecord } from '#content/loader';
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
 * Per-skill consumer — creates one directory symlink per skill in
 * `.agent/skills/`, instead of a single skills-root symlink. Codex documents
 * symlinked skill folders as a supported discovery shape.
 *
 * Source-of-truth is `.agent/skills/<slug>/` — the consumer projection
 * produced by `runUnifiedSync`.
 */
export interface PerSkillConsumerConfig {
    dir: string;
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
 *   - `.claude/rules/`: symlink, accepts rule
 *   - `.claude/skills/`: symlink, accepts skill
 *   - `.agents/skills/`: symlink, accepts skill (Codex/OpenCode portable root)
 * Codex intentionally has no `.codex/agents/` consumer. Official Codex skill
 * discovery is `.agents/skills/`, `~/.agents/skills`, and `/etc/codex/skills`.
 */
export declare const DEFAULT_UNIFIED_CONSUMERS: readonly UnifiedConsumerConfig[];
//# sourceMappingURL=consumers.d.ts.map