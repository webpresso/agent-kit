/**
 * Package Import Rules
 *
 * Pure shared detection logic for identifying duplicate shared-function definitions.
 * No hook-specific types or Claude runtime dependencies.
 *
 * Consumed by:
 * - @webpresso/claude-hooks (pretool-guard validator, thin adapter)
 * - CI scripts (future)
 *
 * @module
 */

// ============================================================================
// Types
// ============================================================================

/** Single shared function definition */
export interface SharedFunction {
  /** Function name to detect */
  name: string
  /** Package to import from */
  package: string
  /** Subpath export (e.g., 'string', 'date'); empty string means package root */
  source: string
  /** Category for grouping */
  category: 'string' | 'date' | 'duration' | 'format' | 'id' | 'error' | 'validation'
}

/** Structured blocked result for machine parsing */
export interface BlockedResult {
  /** Function name that was duplicated */
  functionName: string
  /** Suggested import statement */
  suggestion: string
  /** Package to import from */
  package: string
  /** Source module path */
  source: string
  /** Human-readable message */
  message: string
}

// ============================================================================
// Registry
// ============================================================================

/**
 * Shared function registry - single source of truth for detectable utilities.
 * These functions are available in shared packages and should not be redefined locally.
 */
export const SHARED_FUNCTIONS: SharedFunction[] = [
  // String utilities (@webpresso/utils/string)
  { name: 'capitalize', package: '@webpresso/utils', source: 'string', category: 'string' },
  { name: 'truncate', package: '@webpresso/utils', source: 'string', category: 'string' },
  { name: 'slugify', package: '@webpresso/utils', source: 'string', category: 'string' },
  { name: 'toTitleCase', package: '@webpresso/utils', source: 'string', category: 'string' },
  { name: 'toKebabCase', package: '@webpresso/utils', source: 'string', category: 'string' },
  { name: 'toCamelCase', package: '@webpresso/utils', source: 'string', category: 'string' },
  { name: 'toSnakeCase', package: '@webpresso/utils', source: 'string', category: 'string' },
  { name: 'removeSpecialChars', package: '@webpresso/utils', source: 'string', category: 'string' },
  { name: 'getInitials', package: '@webpresso/utils', source: 'string', category: 'string' },
  { name: 'maskEmail', package: '@webpresso/utils', source: 'string', category: 'string' },
  { name: 'countWords', package: '@webpresso/utils', source: 'string', category: 'string' },
  { name: 'containsIgnoreCase', package: '@webpresso/utils', source: 'string', category: 'string' },
  { name: 'randomString', package: '@webpresso/utils', source: 'string', category: 'string' },
  {
    name: 'levenshteinDistance',
    package: '@webpresso/utils',
    source: 'string',
    category: 'string',
  },
  { name: 'closestMatch', package: '@webpresso/utils', source: 'string', category: 'string' },
  { name: 'findClosestMatch', package: '@webpresso/utils', source: 'string', category: 'string' },
  { name: 'escapeRegex', package: '@webpresso/utils', source: 'string', category: 'string' },

  // Date utilities (@webpresso/utils/date)
  { name: 'formatDate', package: '@webpresso/utils', source: 'date', category: 'date' },
  { name: 'formatRelativeTime', package: '@webpresso/utils', source: 'date', category: 'date' },
  { name: 'isToday', package: '@webpresso/utils', source: 'date', category: 'date' },
  { name: 'isWithinDays', package: '@webpresso/utils', source: 'date', category: 'date' },
  { name: 'addDays', package: '@webpresso/utils', source: 'date', category: 'date' },
  { name: 'subtractDays', package: '@webpresso/utils', source: 'date', category: 'date' },
  { name: 'startOfDay', package: '@webpresso/utils', source: 'date', category: 'date' },
  { name: 'endOfDay', package: '@webpresso/utils', source: 'date', category: 'date' },

  // Duration utilities (@webpresso/utils/duration)
  { name: 'formatDuration', package: '@webpresso/utils', source: 'duration', category: 'duration' },
  {
    name: 'formatDurationSeconds',
    package: '@webpresso/utils',
    source: 'duration',
    category: 'duration',
  },

  // Format utilities (@webpresso/utils/format)
  { name: 'formatNumber', package: '@webpresso/utils', source: 'format', category: 'format' },
  { name: 'formatPercentage', package: '@webpresso/utils', source: 'format', category: 'format' },
  {
    name: 'formatCompactNumber',
    package: '@webpresso/utils',
    source: 'format',
    category: 'format',
  },
  { name: 'formatBytes', package: '@webpresso/utils', source: 'format', category: 'format' },
  { name: 'formatPhoneNumber', package: '@webpresso/utils', source: 'format', category: 'format' },

  // ID utilities (@webpresso/utils/id)
  { name: 'generateId', package: '@webpresso/utils', source: 'id', category: 'id' },
  { name: 'generateSlug', package: '@webpresso/utils', source: 'id', category: 'id' },
  { name: 'generateSlugUnderscore', package: '@webpresso/utils', source: 'id', category: 'id' },

  // Error utilities (@webpresso/utils/errors)
  { name: 'createErrorContext', package: '@webpresso/utils', source: 'errors', category: 'error' },
  { name: 'getErrorMessage', package: '@webpresso/utils', source: 'errors', category: 'error' },
  { name: 'isRetryableError', package: '@webpresso/utils', source: 'errors', category: 'error' },
  { name: 'serializeError', package: '@webpresso/utils', source: 'errors', category: 'error' },
  {
    name: 'serializeUnknownError',
    package: '@webpresso/utils',
    source: 'errors',
    category: 'error',
  },
  { name: 'toError', package: '@webpresso/utils', source: 'errors', category: 'error' },

  // Validation utilities (@webpresso/utils/validation)
  {
    name: 'validateProjectName',
    package: '@webpresso/utils',
    source: 'validation',
    category: 'validation',
  },

  // Error response utilities (@webpresso/hono-utils)
  {
    name: 'errorResponse',
    package: '@webpresso/hono-utils',
    source: '',
    category: 'error',
  },
  { name: 'badRequest', package: '@webpresso/hono-utils', source: '', category: 'error' },
  { name: 'notFound', package: '@webpresso/hono-utils', source: '', category: 'error' },
  { name: 'forbidden', package: '@webpresso/hono-utils', source: '', category: 'error' },
  {
    name: 'internalError',
    package: '@webpresso/hono-utils',
    source: '',
    category: 'error',
  },
  {
    name: 'authRequired',
    package: '@webpresso/hono-utils',
    source: '',
    category: 'error',
  },
  { name: 'authFailed', package: '@webpresso/hono-utils', source: '', category: 'error' },
  { name: 'noToken', package: '@webpresso/hono-utils', source: '', category: 'error' },
  {
    name: 'missingApiKey',
    package: '@webpresso/hono-utils',
    source: '',
    category: 'error',
  },
  {
    name: 'invalidApiKey',
    package: '@webpresso/hono-utils',
    source: '',
    category: 'error',
  },
  {
    name: 'expiredApiKey',
    package: '@webpresso/hono-utils',
    source: '',
    category: 'error',
  },
  { name: 'dbError', package: '@webpresso/hono-utils', source: '', category: 'error' },
  {
    name: 'apiKeyDbError',
    package: '@webpresso/hono-utils',
    source: '',
    category: 'error',
  },
  {
    name: 'invalidSession',
    package: '@webpresso/hono-utils',
    source: '',
    category: 'error',
  },
  {
    name: 'missingHeaders',
    package: '@webpresso/hono-utils',
    source: '',
    category: 'error',
  },
  {
    name: 'invalidSignature',
    package: '@webpresso/hono-utils',
    source: '',
    category: 'error',
  },
  {
    name: 'webhookFailed',
    package: '@webpresso/hono-utils',
    source: '',
    category: 'error',
  },
]

/** Set of function names for O(1) lookup */
export const SHARED_FUNCTION_NAMES = new Set(SHARED_FUNCTIONS.map((f) => f.name))

// ============================================================================
// Pure detection helpers
// ============================================================================

/**
 * Finds a shared function by name
 */
function findSharedFunction(name: string): SharedFunction | undefined {
  return SHARED_FUNCTIONS.find((f) => f.name === name)
}

/**
 * Extracts function names from regex matches
 */
function extractNamesFromPattern(content: string, pattern: RegExp): string[] {
  const names: string[] = []
  let match = pattern.exec(content)

  while (match !== null) {
    const name = match[1]
    if (name) names.push(name)
    match = pattern.exec(content)
  }

  return names
}

/**
 * Checks if a matched position is likely an arrow function
 */
function isLikelyArrowFunction(content: string, matchIndex: number, matchLength: number): boolean {
  const afterMatch = content.slice(matchIndex + matchLength)
  return (
    afterMatch.includes('=>') ||
    afterMatch.includes('function') ||
    afterMatch.trim().startsWith('(')
  )
}

/**
 * Extracts arrow function names from content
 */
function extractArrowFunctions(
  content: string,
  pattern: RegExp,
  existingNames: string[],
): string[] {
  const names: string[] = []
  let match = pattern.exec(content)

  while (match !== null) {
    const name = match[1]
    if (
      name &&
      !existingNames.includes(name) &&
      !names.includes(name) &&
      isLikelyArrowFunction(content, match.index, match[0].length)
    ) {
      names.push(name)
    }
    match = pattern.exec(content)
  }

  return names
}

/**
 * Extracts function expression names from content
 */
function extractFunctionExpressions(
  content: string,
  pattern: RegExp,
  existingNames: string[],
): string[] {
  const names: string[] = []
  let match = pattern.exec(content)

  while (match !== null) {
    const name = match[1]
    if (name && !existingNames.includes(name) && !names.includes(name)) {
      names.push(name)
    }
    match = pattern.exec(content)
  }

  return names
}

/**
 * Extracts function definitions from TypeScript code content.
 * Detects:
 * - Function declarations: `function capitalize(...)`
 * - Const arrow functions: `const capitalize = (...)`
 * - Const function expressions: `const capitalize = function(...)`
 */
export function extractFunctionDefinitions(content: string): string[] {
  const funcDeclPattern = /(?:export\s+)?(?:default\s+)?function\s+(\w+)\s*\(/g
  const arrowFuncPattern = /(?:export\s+)?const\s+(\w+)\s*[=:]\s*[<(]/g
  const funcExprPattern = /(?:export\s+)?const\s+(\w+)\s*=\s*function\s*\(/g

  const declarations = extractNamesFromPattern(content, funcDeclPattern)
  const arrowFunctions = extractArrowFunctions(content, arrowFuncPattern, declarations)
  const allNames = [...declarations, ...arrowFunctions]
  const functionExpressions = extractFunctionExpressions(content, funcExprPattern, allNames)

  return [...declarations, ...arrowFunctions, ...functionExpressions]
}

// ============================================================================
// Public API
// ============================================================================

/**
 * Finds duplicate functions that exist in shared packages.
 * Pure function — accepts file content string, returns matching registry entries.
 */
export function findDuplicateFunctions(fileContent: string): SharedFunction[] {
  const definedFunctions = extractFunctionDefinitions(fileContent)
  const duplicates: SharedFunction[] = []

  for (const funcName of definedFunctions) {
    const sharedFunc = findSharedFunction(funcName)
    if (sharedFunc) {
      duplicates.push(sharedFunc)
    }
  }

  return duplicates
}

/**
 * Creates a blocked result for a duplicate function.
 * Returns a plain object suitable for use by CI scripts and hook adapters.
 */
export function createBlockedResult(sharedFunc: SharedFunction): BlockedResult {
  const importPath = sharedFunc.source
    ? `${sharedFunc.package}/${sharedFunc.source}`
    : sharedFunc.package
  const suggestion = `import { ${sharedFunc.name} } from '${importPath}'`

  return {
    functionName: sharedFunc.name,
    suggestion,
    package: sharedFunc.package,
    source: sharedFunc.source,
    message: `Function '${sharedFunc.name}' already exists in ${sharedFunc.package}.

Use shared utility instead of redefining locally:
  ${suggestion}

This reduces code duplication and ensures consistency across the monorepo.
See: AGENTS.md "Dynamic Package Targeting" section`,
  }
}
