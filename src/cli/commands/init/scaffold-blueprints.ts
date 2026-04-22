/**
 * Create `blueprints/{draft,planned,in-progress,completed,parked,archived}/`
 * with `.gitkeep` files and a short README pointing to the relevant templates
 * and skills.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { type MergeOptions, type MergeResult, writeFileMerged } from './merge.js'

export const BLUEPRINT_STATES = [
  'draft',
  'planned',
  'in-progress',
  'completed',
  'parked',
  'archived',
] as const

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
- \`in-progress → completed\`: all acceptance criteria verified.
- Any state → \`archived\`: when the work is dropped or replaced.

Move files with \`git mv\` so history follows the spec through its lifecycle.
`

export interface ScaffoldBlueprintsInput {
  repoRoot: string
  options: MergeOptions
}

export function scaffoldBlueprints(input: ScaffoldBlueprintsInput): MergeResult[] {
  const { repoRoot, options } = input
  const blueprintsDir = join(repoRoot, 'blueprints')
  const results: MergeResult[] = []

  for (const state of BLUEPRINT_STATES) {
    const stateDir = join(blueprintsDir, state)
    const gitkeep = join(stateDir, '.gitkeep')
    if (!options.dryRun) {
      if (!existsSync(stateDir)) mkdirSync(stateDir, { recursive: true })
      if (!existsSync(gitkeep)) writeFileSync(gitkeep, '')
    }
    results.push({
      targetPath: gitkeep,
      action: existsSync(gitkeep) ? 'identical' : options.dryRun ? 'skipped-dry' : 'created',
    })
  }

  results.push(writeFileMerged(join(blueprintsDir, 'README.md'), BLUEPRINTS_README, options))

  return results
}
