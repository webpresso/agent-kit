/**
 * TechDebt schema module exports
 *
 * Re-exports all schemas and types for technical debt document validation
 */

export {
  extractCheckboxStatus,
  parseTechDebt,
  type RemediationStep,
  serializeTechDebt,
  type TechDebtItem,
} from './parser.js'
export {
  isCategory,
  isSeverity,
  isTechDebtStatus,
  type TechDebtQueryFilters,
  type TechDebtQueryResult,
  type TechDebtQuerySummary,
  type TechDebtRecord,
  type TechDebtSortField,
  type TechDebtSortOptions,
} from './query-types.js'
export {
  categorySchema,
  type ReviewCadence,
  reviewCadenceSchema,
  severitySchema,
  type TechDebtCategory,
  type TechDebtFrontmatter,
  type TechDebtSeverity,
  type TechDebtSlug,
  type TechDebtStatus,
  techDebtFrontmatterSchema,
  techDebtSlugSchema,
  techDebtStatusSchema,
} from './schema.js'
