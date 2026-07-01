/**
 * Extended Plan Types for Sprint Board Queries
 *
 * Use blueprint-owned query types and guards.
 */
import { planStatusSchema, taskStatusSchema, } from "#core/schema";
export function isBlueprintStatus(value) {
    return planStatusSchema.options.includes(value);
}
export function isComplexity(value) {
    return ["XS", "S", "M", "L", "XL"].includes(value);
}
export function isTaskStatus(value) {
    return taskStatusSchema.options.includes(value);
}
//# sourceMappingURL=types.js.map