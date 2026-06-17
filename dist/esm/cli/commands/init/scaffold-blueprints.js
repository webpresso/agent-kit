/**
 * Create `blueprints/{draft,planned,in-progress,completed,parked,archived}/`
 * with `.gitkeep` files and a short README pointing to the relevant templates
 * and skills.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { resolveBlueprintRoot } from '#utils/blueprint-root';
import { writeFileMerged } from './merge.js';
/**
 * For scaffolding (first-time setup), `resolveBlueprintRoot` falls back to
 * `webpresso/blueprints` for repos with no project markers at all.  A fresh
 * generic repo should get `blueprints/` instead.  We correct this by only
 * accepting the webpresso fallback when there is an actual webpresso marker on
 * disk.
 */
function resolveScaffoldBlueprintsDir(repoRoot) {
    const resolved = resolveBlueprintRoot(repoRoot);
    const webpressoBlueprints = join(repoRoot, 'webpresso', 'blueprints');
    const isWebpressoRepo = existsSync(join(repoRoot, 'webpresso', 'config.yaml'));
    if (!isWebpressoRepo && resolved === webpressoBlueprints) {
        return join(repoRoot, 'blueprints');
    }
    return resolved;
}
export const BLUEPRINT_STATES = [
    'draft',
    'planned',
    'in-progress',
    'completed',
    'parked',
    'archived',
];
const BLUEPRINTS_README = `# Blueprints

This directory is the canonical home for implementation plans (blueprints).
Each subdirectory represents a lifecycle state:

- \`draft/\` — early-stage sketches. Expect churn; move to \`planned/\` once scoped.
- \`planned/\` — committed-to specs, ready to pick up.
- \`in-progress/\` — actively being executed. Exactly one blueprint per lane.
- \`completed/\` — execution finished and verified. Kept for reference.
- \`parked/\` — intentionally paused. Include a reason in the spec's frontmatter.
- \`archived/\` — superseded or abandoned. Not deleted — the record matters.

## Authoring

- Use \`docs/templates/blueprint.md\` as the starting point.
- Blueprint YAML keys validated against \`docs/templates/blueprint.yaml\`.
- For iterative refinement, load the \`plan-refine\` skill
  (\`.agent/skills/plan-refine/SKILL.md\`).

## Moving between states

- \`draft → planned\`: the spec passes the plan-audit checklist
  (\`.agent/guides/plan-audit-checklist.md\`).
- \`planned → in-progress\`: work has started in a worktree or a lane.
- \`planned → completed\`: allowed for one-PR completion when every task is already terminal and verification is attached.
- \`in-progress → completed\`: all acceptance criteria verified.
- \`completed → in-progress\`: explicit reopen path when follow-up work is discovered after closeout.
- Any state → \`archived\`: when the work is dropped or replaced.

Move files with \`git mv\` so history follows the spec through its lifecycle.
`;
export function scaffoldBlueprints(input) {
    const { repoRoot, options } = input;
    const blueprintsDir = resolveScaffoldBlueprintsDir(repoRoot);
    const results = [];
    for (const state of BLUEPRINT_STATES) {
        const stateDir = join(blueprintsDir, state);
        const gitkeep = join(stateDir, '.gitkeep');
        if (!options.dryRun) {
            if (!existsSync(stateDir))
                mkdirSync(stateDir, { recursive: true });
            if (!existsSync(gitkeep))
                writeFileSync(gitkeep, '');
        }
        results.push({
            targetPath: gitkeep,
            action: existsSync(gitkeep) ? 'identical' : options.dryRun ? 'skipped-dry' : 'created',
        });
    }
    results.push(writeFileMerged(join(blueprintsDir, 'README.md'), BLUEPRINTS_README, options));
    return results;
}
//# sourceMappingURL=scaffold-blueprints.js.map