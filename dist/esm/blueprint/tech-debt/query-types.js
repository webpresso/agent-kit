/**
 * TechDebt Query Types for Service Layer
 *
 * These types extend the base tech debt schema with query-specific fields
 * for filtering, sorting, and summarizing technical debt records.
 *
 * Follows the pattern established in blueprint/query-types.ts.
 */
import { categorySchema, severitySchema, techDebtStatusSchema, } from "./schema.js";
/**
 * Type guard to check if a string is a valid TechDebtStatus.
 * Derives valid values from the Zod schema to ensure single source of truth.
 * @param value - The string to check
 * @returns True if the value is a valid TechDebtStatus
 */
export function isTechDebtStatus(value) {
    return techDebtStatusSchema.options.includes(value);
}
/**
 * Type guard to check if a string is a valid Severity.
 * Derives valid values from the Zod schema to ensure single source of truth.
 * @param value - The string to check
 * @returns True if the value is a valid Severity
 */
export function isSeverity(value) {
    return severitySchema.options.includes(value);
}
/**
 * Type guard to check if a string is a valid TechDebtCategory.
 * Derives valid values from the Zod schema to ensure single source of truth.
 * @param value - The string to check
 * @returns True if the value is a valid TechDebtCategory
 */
export function isCategory(value) {
    return categorySchema.options.includes(value);
}
//# sourceMappingURL=query-types.js.map