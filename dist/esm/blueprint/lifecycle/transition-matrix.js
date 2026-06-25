import { lifecycleBlueprintStatusSchema } from "#core/schema.js";
const LEGAL_TRANSITIONS = {
    draft: ["planned", "completed", "archived"],
    planned: ["in-progress", "completed", "parked", "archived"],
    "in-progress": ["completed", "parked", "archived"],
    parked: ["in-progress", "planned", "archived"],
    completed: ["in-progress", "archived"],
    archived: [],
};
export function parseLifecycleBlueprintStatus(value) {
    const parsed = lifecycleBlueprintStatusSchema.safeParse(value);
    return parsed.success ? parsed.data : null;
}
export function getLegalLifecycleTargets(from) {
    return LEGAL_TRANSITIONS[from];
}
export function isLegalLifecycleTransition(from, to) {
    return getLegalLifecycleTargets(from).includes(to);
}
//# sourceMappingURL=transition-matrix.js.map