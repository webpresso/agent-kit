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
export declare function syncPerSkillConsumer(repoRoot: string, config: PerSkillConsumerConfig): number;
export declare function syncPerSkillConsumers(repoRoot: string, consumers?: PerSkillConsumerConfig[]): number;
export declare function createSymlink(repoRoot: string, consumerDir: string, file: string, symlinkTarget: string): void;
export declare function fixExistingFile(repoRoot: string, config: ConsumerConfig, file: string, agentSources: Map<string, string>): boolean;
export declare function createMissingSymlinks(repoRoot: string, config: ConsumerConfig, existingFiles: Set<string>, agentSources: Map<string, string>): number;
export declare function syncConsumer(repoRoot: string, config: ConsumerConfig, agentSources: Map<string, string>): number;
export declare function syncGeminiCommands(repoRoot: string): number;
export declare function syncAll(repoRoot: string, consumers?: ConsumerConfig[]): number;
//# sourceMappingURL=index.d.ts.map