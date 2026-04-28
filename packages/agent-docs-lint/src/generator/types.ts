/**
 * Template schema types loaded from templates/*.yaml
 */
export interface TemplateSchema {
  name: string
  description: string
  frontmatter: {
    required: Record<string, FrontmatterField>
    optional?: Record<string, FrontmatterField>
  }
  sections: {
    required: SectionDefinition[]
    optional?: SectionDefinition[]
  }
  location: {
    patterns: string[]
    exclude?: string[]
  }
  naming: {
    pattern: string
    case: 'lower' | 'upper' | 'exact'
    description?: string
    notes?: string
  }
}

export interface FrontmatterField {
  value?: string
  enum?: string[]
  type?: 'string' | 'date' | 'array'
  format?: string
  description?: string
}

export interface SectionDefinition {
  name: string
  pattern?: string
  description?: string
}

/**
 * SSOT data that populates deterministic sections
 */
export interface SsotData {
  /** Key-value pairs for frontmatter fields */
  frontmatter: Record<string, string | string[] | undefined>
  /** Named sections with their markdown content */
  sections: Record<string, string>
}

/**
 * LLM-generated narrative blocks
 */
export interface LlmBlock {
  /** Section name this block belongs to */
  section: string
  /** Markdown content from LLM */
  content: string
  /** Optional metadata about generation */
  metadata?: {
    model?: string
    tokens?: number
    timestamp?: string
  }
}

/**
 * Input for generateDoc function
 */
export interface GenerateDocInput {
  /** Template name (matches templates/{name}.yaml) */
  template: string
  /** SSOT data for deterministic sections */
  ssot: SsotData
  /** LLM-generated narrative blocks */
  llmBlocks: LlmBlock[]
}

/**
 * Result from generateDoc function
 */
export interface GenerateDocResult {
  /** Whether generation succeeded */
  success: boolean
  /** Generated markdown content (if success) */
  markdown?: string
  /** Validation errors (if failed) */
  errors?: ValidationError[]
}

/**
 * Validation error with actionable context
 */
export interface ValidationError {
  /** Error code for programmatic handling */
  code: ValidationErrorCode
  /** Human-readable error message */
  message: string
  /** Field or section that failed validation */
  field?: string
  /** Expected value or pattern */
  expected?: string
  /** Actual value received */
  actual?: string
}

export type ValidationErrorCode =
  | 'TEMPLATE_NOT_FOUND'
  | 'TEMPLATE_PARSE_ERROR'
  | 'MISSING_REQUIRED_FRONTMATTER'
  | 'INVALID_FRONTMATTER_VALUE'
  | 'MISSING_REQUIRED_SECTION'
  | 'INVALID_SECTION_CONTENT'
  | 'LLM_BLOCK_INVALID_SECTION'
  | 'DUPLICATE_SECTION'
