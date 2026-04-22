/**
 * Shared plan validation utilities for CLI tools.
 */

export type { CriteriaResult, ValidationResult } from '#core/types'
export { checkAcceptanceCriteria } from './criteria'
export type { DependencyValidationResult } from './dependencies'
export { validateTaskDependencies } from './dependencies'
export { checkChangelog, validatePlanLinks } from './links'
export { validateEmbeddedPhases } from './phases'
export { validatePlanState } from './state'
export { validatePlanTemplate } from './template'
export { validateTaskSections } from './task-sections'
