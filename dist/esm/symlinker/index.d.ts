#!/usr/bin/env node
/**
 * Audit & Auto-Fix: Agent Command/Workflow Symlinks
 *
 * Ensures all consumer directories (e.g. .claude/commands) use symlinks
 * pointing to `.agent/` source files, keeps skill directories as single
 * directory-symlinks, and regenerates `.gemini/commands/*.toml` from
 * markdown sources.
 *
 * Auto-fixes:
 * - Replaces real files with symlinks to .agent/ source
 * - Removes broken symlinks and recreates them
 * - Removes stale mirrored files when the .agent/ source no longer exists
 * - Creates missing symlinks for all .agent/ entries
 * - Removes symlinks pointing outside .agent/
 *
 * Usage:
 *   ak symlink sync            # Phase 2 — wires to syncAll
 *   node dist/symlinker/index  # direct invocation from built output
 */
import { ALLOWED_REAL_FILES, type ConsumerConfig, DEFAULT_CONSUMERS, DEFAULT_PER_SKILL_CONSUMERS, DEFAULT_SKILLS_CONSUMERS, type PerSkillConsumerConfig, type SkillsConsumerConfig } from './consumers.js';
export { ALLOWED_REAL_FILES, type ConsumerConfig, DEFAULT_CONSUMERS, DEFAULT_PER_SKILL_CONSUMERS, DEFAULT_SKILLS_CONSUMERS, type PerSkillConsumerConfig, type SkillsConsumerConfig, };
export declare function isAgentOrConsumerFile(file: string): boolean;
export declare function getAgentSources(repoRoot: string): Map<string, string>;
export declare function syncSkillsConsumer(repoRoot: string, config: SkillsConsumerConfig): number;
export declare function syncSkills(repoRoot: string, consumers?: SkillsConsumerConfig[]): number;
export interface SyncSkillFanoutResult {
    readonly wrote: number;
}
/**
 * Directory-level skill projection from `.agent/skills/<slug>/` into a
 * per-IDE consumer dir (e.g. `.agents/skills/<slug>`). Codex documents support
 * for symlinked skill folders; file-level `SKILL.md` symlinks inside real
 * folders are not a documented discovery shape and can be skipped by hosts.
 *
 * Source-of-truth: `.agent/skills/<slug>/` (the consumer projection
 * produced by `runUnifiedSync` + scaffolders). NOT `node_modules/.../skills/`
 * (the legacy `sourceRootDir` semantic was dropped — the bug class was
 * an asymmetric fallback where listing succeeded against `.agent/skills/`
 * but symlink targets pointed at the missing `node_modules/.../skills/`).
 *
 * Contract: `.agents/skills/<slug>` is an agent-kit-owned generated symlink.
 * Top-level entries that do not correspond to a skill in `.agent/skills/` are
 * removed recursively. Real directories for expected slugs are also replaced
 * so stale file-level projections cannot mask the official directory-symlink
 * discovery surface.
 *
 * Throws (synchronously) on any file-op error so callers see fail-loud
 * exit codes instead of `console.log('✅')` followed by broken state.
 */
export declare function syncSkillFanout(repoRoot: string, config: PerSkillConsumerConfig): SyncSkillFanoutResult;
export declare function syncSkillFanouts(repoRoot: string, consumers?: PerSkillConsumerConfig[]): SyncSkillFanoutResult;
export declare function createSymlink(repoRoot: string, consumerDir: string, file: string, symlinkTarget: string): void;
export declare function fixExistingFile(repoRoot: string, config: ConsumerConfig, file: string, agentSources: Map<string, string>): boolean;
export declare function createMissingSymlinks(repoRoot: string, config: ConsumerConfig, existingFiles: Set<string>, agentSources: Map<string, string>): number;
export declare function syncConsumer(repoRoot: string, config: ConsumerConfig, agentSources: Map<string, string>): number;
export declare function syncGeminiCommands(repoRoot: string): number;
/**
 * Sync repo-root AGENTS.md from canonical .agent/AGENTS.md.
 * Returns 1 if a write occurred, 0 if already up to date.
 */
export declare function syncAgentsMd(repoRoot: string): number;
/**
 * Fan out .agent/mcp.json to canonical MCP consumer paths:
 *   .mcp.json, .cursor/mcp.json
 * Returns the number of files written/updated.
 */
export declare function syncMcpJson(repoRoot: string): number;
export declare function syncAll(repoRoot: string, consumers?: ConsumerConfig[]): number;
/**
 * Import an existing IDE rule file into the canonical .agent/ directory.
 *
 * Supported sources: .cursorrules, CLAUDE.md, .github/copilot-instructions.md
 *
 * The source file is copied to .agent/AGENTS.md (if it does not already
 * exist), leaving the original in place so that a subsequent `ak symlink sync`
 * can fan it back out.  Returns the destination path on success, or null when
 * the source file does not exist.
 */
export declare function importAgentFile(repoRoot: string, fromPath: string): {
    source: string;
    dest: string;
} | null;
//# sourceMappingURL=index.d.ts.map