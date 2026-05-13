import type { DocType } from './schemas/index.js'

export * from './parsers/index.js'
export * from './schemas/index.js'

export type {
  DocType,
  DocTypeConfig,
  ValidationError as SchemaValidationError,
} from './schemas/index.js'
export type { ParsedDocument } from './parsers/frontmatter.js'

export interface ValidationError {
  file: string
  line?: number
  column?: number
  severity: 'error' | 'warning'
  source: 'schema' | 'markdownlint' | 'vale' | 'structure' | 'context-limits' | 'blueprint-format'
  message: string
  ruleId?: string
}

export interface ContextFileLimits {
  maxLines: number
  warnLines: number
  maxTokens?: number
  warnTokens?: number
  description: string
}

export interface ValidationResult {
  file: string
  errors: ValidationError[]
  warnings: ValidationError[]
  valid: boolean
}

export interface MigrationResult {
  file: string
  action: 'added' | 'updated' | 'skipped' | 'error'
  docType: DocType
  message?: string
}
