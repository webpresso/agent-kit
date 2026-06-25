/**
 * Shared plan validation utilities for CLI tools.
 */

export type { CriteriaResult, ValidationResult } from "#core/types";
export { checkAcceptanceCriteria } from "./criteria.js";
export type { DependencyValidationResult } from "./dependencies.js";
export { validateTaskDependencies } from "./dependencies.js";
export { checkChangelog, validatePlanLinks } from "./links.js";
export { validateEmbeddedPhases } from "./phases.js";
export { validatePlanState } from "./state.js";
export { validatePlanTemplate } from "./template.js";
export { validateTaskSections } from "./task-sections.js";
