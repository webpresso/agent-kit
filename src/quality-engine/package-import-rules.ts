/**
 * Package Import Rules
 *
 * Pure shared detection logic for identifying duplicate shared-function definitions.
 * No hook-specific types or Claude runtime dependencies.
 *
 * Consumed by:
 * - hook validators (thin adapters)
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

export type PackageImportProfile = 'generic' | 'webpresso'

export interface PackageImportRuleOptions {
  profile?: PackageImportProfile
}

// ============================================================================
// Registry
// ============================================================================

const GENERIC_SHARED_FUNCTIONS: SharedFunction[] = []

const WEBPRESSO_SHARED_FUNCTIONS: SharedFunction[] = [
  // String utilities (@webpresso/framework/runtime/format/string)
  {
    name: 'capitalize',
    package: '@webpresso/framework',
    source: 'runtime/format/string',
    category: 'string',
  },
  {
    name: 'truncate',
    package: '@webpresso/framework',
    source: 'runtime/format/string',
    category: 'string',
  },
  {
    name: 'slugify',
    package: '@webpresso/framework',
    source: 'runtime/format/string',
    category: 'string',
  },
  {
    name: 'toTitleCase',
    package: '@webpresso/framework',
    source: 'runtime/format/string',
    category: 'string',
  },
  {
    name: 'toKebabCase',
    package: '@webpresso/framework',
    source: 'runtime/format/string',
    category: 'string',
  },
  {
    name: 'toCamelCase',
    package: '@webpresso/framework',
    source: 'runtime/format/string',
    category: 'string',
  },
  {
    name: 'toSnakeCase',
    package: '@webpresso/framework',
    source: 'runtime/format/string',
    category: 'string',
  },
  {
    name: 'removeSpecialChars',
    package: '@webpresso/framework',
    source: 'runtime/format/string',
    category: 'string',
  },
  {
    name: 'getInitials',
    package: '@webpresso/framework',
    source: 'runtime/format/string',
    category: 'string',
  },
  {
    name: 'maskEmail',
    package: '@webpresso/framework',
    source: 'runtime/format/string',
    category: 'string',
  },
  {
    name: 'countWords',
    package: '@webpresso/framework',
    source: 'runtime/format/string',
    category: 'string',
  },
  {
    name: 'containsIgnoreCase',
    package: '@webpresso/framework',
    source: 'runtime/format/string',
    category: 'string',
  },
  {
    name: 'randomString',
    package: '@webpresso/framework',
    source: 'runtime/format/string',
    category: 'string',
  },
  {
    name: 'levenshteinDistance',
    package: '@webpresso/framework',
    source: 'runtime/format/string',
    category: 'string',
  },
  {
    name: 'closestMatch',
    package: '@webpresso/framework',
    source: 'runtime/format/string',
    category: 'string',
  },
  {
    name: 'findClosestMatch',
    package: '@webpresso/framework',
    source: 'runtime/format/string',
    category: 'string',
  },
  {
    name: 'escapeRegex',
    package: '@webpresso/framework',
    source: 'runtime/format/string',
    category: 'string',
  },

  // Date utilities (@webpresso/framework/runtime/format/date)
  {
    name: 'formatDate',
    package: '@webpresso/framework',
    source: 'runtime/format/date',
    category: 'date',
  },
  {
    name: 'formatRelativeTime',
    package: '@webpresso/framework',
    source: 'runtime/format/date',
    category: 'date',
  },
  {
    name: 'isToday',
    package: '@webpresso/framework',
    source: 'runtime/format/date',
    category: 'date',
  },
  {
    name: 'isWithinDays',
    package: '@webpresso/framework',
    source: 'runtime/format/date',
    category: 'date',
  },
  {
    name: 'addDays',
    package: '@webpresso/framework',
    source: 'runtime/format/date',
    category: 'date',
  },
  {
    name: 'subtractDays',
    package: '@webpresso/framework',
    source: 'runtime/format/date',
    category: 'date',
  },
  {
    name: 'startOfDay',
    package: '@webpresso/framework',
    source: 'runtime/format/date',
    category: 'date',
  },
  {
    name: 'endOfDay',
    package: '@webpresso/framework',
    source: 'runtime/format/date',
    category: 'date',
  },

  // Duration utilities (@webpresso/framework/runtime/format/duration)
  {
    name: 'formatDuration',
    package: '@webpresso/framework',
    source: 'runtime/format/duration',
    category: 'duration',
  },
  {
    name: 'formatDurationSeconds',
    package: '@webpresso/framework',
    source: 'runtime/format/duration',
    category: 'duration',
  },

  // Format utilities (@webpresso/framework/runtime/format/format)
  {
    name: 'formatNumber',
    package: '@webpresso/framework',
    source: 'runtime/format/format',
    category: 'format',
  },
  {
    name: 'formatPercentage',
    package: '@webpresso/framework',
    source: 'runtime/format/format',
    category: 'format',
  },
  {
    name: 'formatCompactNumber',
    package: '@webpresso/framework',
    source: 'runtime/format/format',
    category: 'format',
  },
  {
    name: 'formatBytes',
    package: '@webpresso/framework',
    source: 'runtime/format/format',
    category: 'format',
  },
  {
    name: 'formatPhoneNumber',
    package: '@webpresso/framework',
    source: 'runtime/format/format',
    category: 'format',
  },

  // ID utilities (@webpresso/framework/runtime/utils/id)
  {
    name: 'generateId',
    package: '@webpresso/framework',
    source: 'runtime/utils/id',
    category: 'id',
  },
  {
    name: 'generateSlug',
    package: '@webpresso/framework',
    source: 'runtime/utils/id',
    category: 'id',
  },
  {
    name: 'generateSlugUnderscore',
    package: '@webpresso/framework',
    source: 'runtime/utils/id',
    category: 'id',
  },

  // Error utilities (@webpresso/framework/runtime/format/errors)
  {
    name: 'createErrorContext',
    package: '@webpresso/framework',
    source: 'runtime/format/errors',
    category: 'error',
  },
  {
    name: 'getErrorMessage',
    package: '@webpresso/framework',
    source: 'runtime/format/errors',
    category: 'error',
  },
  {
    name: 'isRetryableError',
    package: '@webpresso/framework',
    source: 'runtime/format/errors',
    category: 'error',
  },
  {
    name: 'serializeError',
    package: '@webpresso/framework',
    source: 'runtime/format/errors',
    category: 'error',
  },
  {
    name: 'serializeUnknownError',
    package: '@webpresso/framework',
    source: 'runtime/format/errors',
    category: 'error',
  },
  {
    name: 'toError',
    package: '@webpresso/framework',
    source: 'runtime/format/errors',
    category: 'error',
  },

  // Validation utilities (@webpresso/framework/runtime/validation/validation)
  {
    name: 'validateProjectName',
    package: '@webpresso/framework',
    source: 'runtime/validation/validation',
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

export const SHARED_FUNCTION_PROFILES: Record<PackageImportProfile, SharedFunction[]> = {
  generic: GENERIC_SHARED_FUNCTIONS,
  webpresso: WEBPRESSO_SHARED_FUNCTIONS,
}

/**
 * Default generic shared function registry. Product-specific rules must opt into
 * a profile explicitly instead of leaking through the generic surface.
 */
export const SHARED_FUNCTIONS: SharedFunction[] = SHARED_FUNCTION_PROFILES.generic

/** Set of function names for O(1) lookup in the default generic profile */
export const SHARED_FUNCTION_NAMES = new Set(SHARED_FUNCTIONS.map((f) => f.name))

export function getSharedFunctions(profile: PackageImportProfile = 'generic'): SharedFunction[] {
  return SHARED_FUNCTION_PROFILES[profile]
}

export function getSharedFunctionNames(profile: PackageImportProfile = 'generic'): Set<string> {
  return new Set(getSharedFunctions(profile).map((f) => f.name))
}

// ============================================================================
// Pure detection helpers
// ============================================================================

/**
 * Finds a shared function by name
 */
function findSharedFunction(
  name: string,
  profile: PackageImportProfile,
): SharedFunction | undefined {
  return getSharedFunctions(profile).find((f) => f.name === name)
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
export function findDuplicateFunctions(
  fileContent: string,
  options: PackageImportRuleOptions = {},
): SharedFunction[] {
  const profile = options.profile ?? 'generic'
  const definedFunctions = extractFunctionDefinitions(fileContent)
  const duplicates: SharedFunction[] = []

  for (const funcName of definedFunctions) {
    const sharedFunc = findSharedFunction(funcName, profile)
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
    message: `Function '${sharedFunc.name}' already exists in a shared package.

Use a shared utility instead of redefining it locally:
  ${suggestion}

This reduces code duplication and keeps shared utilities consistent across the codebase.`,
  }
}
