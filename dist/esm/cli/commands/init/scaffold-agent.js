/**
 * Copy `catalog/agent/` into the consumer's `.agent/`, honouring tier rules.
 *
 * - Commands/Workflows/Rules/Guides: always installed (top-of-funnel content).
 * - Skills: split by tier.
 *   - Tier-1 (verify, testing-philosophy, plan-refine, pll) — always.
 *   - Tier-2 (systematic-debugging, test-driven-development, deep-research) — always.
 *   - monorepo-navigation — always (rendered via a separate scaffold step).
 *   - Tier-3 — only on opt-in via --with / --all / interactive prompt.
 */
import { existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { copyDirectoryMerged, copyFileMerged, } from './merge.js';
export const TIER1_SKILLS = ['verify', 'testing-philosophy', 'plan-refine', 'pll'];
export const TIER2_SKILLS = [
    'systematic-debugging',
    'test-driven-development',
    'deep-research',
];
/** Always-installed skill (rendered separately). Excluded from the generic copy. */
export const RENDERED_SKILLS = ['monorepo-navigation'];
const ALWAYS_COPY_SUBDIRS = ['commands', 'workflows', 'rules', 'guides'];
export function scaffoldAgent(input) {
    const { catalogDir, repoRoot, selectedTier3, options } = input;
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
    // Skills are per-directory: each skill is `<name>/SKILL.md` + optional assets.
    const skillsSrc = join(catalogAgent, 'skills');
    const skillsDst = join(targetAgent, 'skills');
    const installedSkills = [];
    const skippedTier3 = [];
    if (existsSync(skillsSrc)) {
        const entries = readdirSync(skillsSrc);
        const allowedTier3 = new Set(selectedTier3);
        for (const name of entries) {
            const skillSrcPath = join(skillsSrc, name);
            if (!statSync(skillSrcPath).isDirectory())
                continue;
            if (RENDERED_SKILLS.includes(name))
                continue;
            const isTier1 = TIER1_SKILLS.includes(name);
            const isTier2 = TIER2_SKILLS.includes(name);
            const isTier3Selected = allowedTier3.has(name);
            if (!isTier1 && !isTier2 && !isTier3Selected) {
                if (!isTier1 && !isTier2)
                    skippedTier3.push(name);
                continue;
            }
            const dst = join(skillsDst, name);
            results.push(...copyDirectoryMerged(skillSrcPath, dst, options));
            installedSkills.push(name);
        }
    }
    // Copy catalog-level README files when present (e.g., agent/workflows/README.md
    // is already handled above; also copy top-level README if the catalog has one).
    const topReadme = join(catalogAgent, 'README.md');
    if (existsSync(topReadme)) {
        results.push(copyFileMerged(topReadme, join(targetAgent, 'README.md'), options));
    }
    return { results, skippedTier3, installedSkills };
}
//# sourceMappingURL=scaffold-agent.js.map