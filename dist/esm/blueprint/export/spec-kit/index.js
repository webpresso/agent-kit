import { emitConstitution } from "./constitution.js";
import { emitPlan } from "./plan.js";
import { emitSpec } from "./spec.js";
import { emitTasks } from "./tasks.js";
/**
 * Convert a parsed blueprint to spec-kit's 4-file structure.
 * Each file is a non-empty string; no content is duplicated across files.
 */
export function blueprintToSpecKit(parsed, repoRoot) {
    return {
        spec: emitSpec(parsed),
        plan: emitPlan(parsed),
        tasks: emitTasks(parsed),
        constitution: emitConstitution(parsed, repoRoot),
    };
}
//# sourceMappingURL=index.js.map