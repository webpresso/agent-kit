import type { ParsedBlueprintForDb } from '#db/parser/blueprint-db-parser'

import { emitConstitution } from './constitution.js'
import { emitPlan } from './plan.js'
import { emitSpec } from './spec.js'
import { emitTasks } from './tasks.js'

export interface SpecKitBundle {
  readonly spec: string
  readonly plan: string
  readonly tasks: string
  readonly constitution: string
}

/**
 * Convert a parsed blueprint to spec-kit's 4-file structure.
 * Each file is a non-empty string; no content is duplicated across files.
 */
export function blueprintToSpecKit(parsed: ParsedBlueprintForDb, repoRoot: string): SpecKitBundle {
  return {
    spec: emitSpec(parsed),
    plan: emitPlan(parsed),
    tasks: emitTasks(parsed),
    constitution: emitConstitution(parsed, repoRoot),
  }
}
