import { z } from 'zod'

export const BLUEPRINT_STATUS = [
  'draft',
  'planned',
  'in-progress',
  'completed',
  'parked',
  'archived',
] as const

export const BLUEPRINT_COMPLEXITY = ['XS', 'S', 'M', 'L', 'XL'] as const

export const TASK_STATUS = ['todo', 'in-progress', 'blocked', 'done', 'dropped'] as const

export const TECH_DEBT_STATUS = [
  'accepted',
  'needs-remediation',
  'monitoring',
  'resolved',
] as const

export const SEVERITY = ['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'] as const

export const TECH_DEBT_SEVERITY = ['critical', 'high', 'medium', 'low'] as const

export const TECH_DEBT_CATEGORY_VALUES = [
  'documentation',
  'architecture',
  'testing',
  'performance',
  'security',
  'maintenance',
  'dependencies',
] as const

export const REVIEW_CADENCE = ['weekly', 'biweekly', 'monthly', 'quarterly'] as const

export const VISIBILITY = ['public', 'private'] as const

export const TASK_FILE_OP = ['create', 'modify', 'delete'] as const

export const blueprintStatusSchema = z.enum(BLUEPRINT_STATUS)
export const blueprintComplexitySchema = z.enum(BLUEPRINT_COMPLEXITY)
export const taskStatusSchema = z.enum(TASK_STATUS)
export const techDebtStatusSchema = z.enum(TECH_DEBT_STATUS)
export const severitySchema = z.enum(SEVERITY)
export const techDebtSeveritySchema = z.enum(TECH_DEBT_SEVERITY)
export const techDebtCategorySchema = z.enum(TECH_DEBT_CATEGORY_VALUES)
export const reviewCadenceSchema = z.enum(REVIEW_CADENCE)
export const visibilitySchema = z.enum(VISIBILITY)
export const taskFileOpSchema = z.enum(TASK_FILE_OP)
