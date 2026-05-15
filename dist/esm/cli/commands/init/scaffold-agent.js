/**
 * Copy `catalog/agent/` into the consumer's `.agent/`, honouring tier rules.
 *
 * Wave-3 narrowing: rules and skills are NO LONGER copied here. They flow
 * exclusively through the `agent-rules/` / `agent-skills/` consumer-owned
 * scaffolders + `runUnifiedSync` projection. This module now only handles
 * commands, workflows, guides, and the top-level catalog README.
 *
 * Tier exports remain because the init orchestrator uses them to compute
 * the allowed-skill set passed to the unified sync filter.
 *
 * - Tier-1 (fix, verify, testing-philosophy, plan-refine, pll) — always.
 * - Tier-2 (systematic-debugging, test-driven-development, deep-research) — always.
 * - monorepo-navigation — always (rendered via a separate scaffold step).
 * - Tier-3 — only on opt-in via --with / --all / interactive prompt.
 */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { copyDirectoryMerged, copyFileMerged, } from './merge.js';
export const TIER1_SKILLS = ['fix', 'verify', 'testing-philosophy', 'plan-refine', 'pll'];
export const TIER2_SKILLS = [
    'systematic-debugging',
    'test-driven-development',
    'deep-research',
];
/** Always-installed skill (rendered separately). Excluded from the generic copy. */
export const RENDERED_SKILLS = ['monorepo-navigation'];
const ALWAYS_COPY_SUBDIRS = ['commands', 'workflows', 'guides'];
/** Top-level catalog files emitted once on fresh setup (never overwritten). */
const FRESH_COPY_FILES = ['correlate.allow.yaml'];
export function scaffoldAgent(input) {
    const { catalogDir, repoRoot, options } = input;
    const catalogAgent = join(catalogDir, 'agent');
    const targetAgent = join(repoRoot, '.agent');
    const results = [];
    for (const subdir of ALWAYS_COPY_SUBDIRS) {
        const src = join(catalogAgent, subdir);
        const dst = join(targetAgent, subdir);
        if (existsSync(src)) {
            results.push(...copyDirectoryMerged(src, dst, options));
        }
    }
    // Top-level catalog README (when present) — small, always safe to mirror.
    const topReadme = join(catalogAgent, 'README.md');
    if (existsSync(topReadme)) {
        results.push(copyFileMerged(topReadme, join(targetAgent, 'README.md'), options));
    }
    // Fresh-only top-level files — emitted once to the consumer's .agent/.
    // These are committed to the consumer repo (not gitignored) so cloud agents
    // and CI can read them. Only written on first setup (absent = fresh).
    for (const file of FRESH_COPY_FILES) {
        const src = join(catalogAgent, file);
        if (existsSync(src)) {
            results.push(copyFileMerged(src, join(targetAgent, file), options));
        }
    }
    return { results };
}
//# sourceMappingURL=scaffold-agent.js.map