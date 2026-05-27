import type { ToolInput, ValidationResult } from '#hooks/shared/types'

import { getContent, getFilePath } from '#hooks/shared/types'
import { createSkipResult } from './skip-result.js'

export interface SharedFunction {
  name: string
  package: string
  source: string
  category: 'string' | 'date' | 'duration' | 'format' | 'id' | 'error' | 'validation'
}

export interface DuplicateFunctionResult extends ValidationResult {
  functionName: string
  suggestion: string
  package: string
  source: string
}

export const VALIDATOR_NAME = 'package-imports'
export const SKIP_ENV_VAR = 'PACKAGE_IMPORTS_SKIP'

export const SHARED_FUNCTIONS: SharedFunction[] = [
  {
    name: 'capitalize',
    package: '@webpresso/webpresso',
    source: 'runtime/format/string',
    category: 'string',
  },
  {
    name: 'truncate',
    package: '@webpresso/webpresso',
    source: 'runtime/format/string',
    category: 'string',
  },
  {
    name: 'slugify',
    package: '@webpresso/webpresso',
    source: 'runtime/format/string',
    category: 'string',
  },
  {
    name: 'toTitleCase',
    package: '@webpresso/webpresso',
    source: 'runtime/format/string',
    category: 'string',
  },
  {
    name: 'toKebabCase',
    package: '@webpresso/webpresso',
    source: 'runtime/format/string',
    category: 'string',
  },
  {
    name: 'toCamelCase',
    package: '@webpresso/webpresso',
    source: 'runtime/format/string',
    category: 'string',
  },
  {
    name: 'toSnakeCase',
    package: '@webpresso/webpresso',
    source: 'runtime/format/string',
    category: 'string',
  },
  {
    name: 'removeSpecialChars',
    package: '@webpresso/webpresso',
    source: 'runtime/format/string',
    category: 'string',
  },
  {
    name: 'getInitials',
    package: '@webpresso/webpresso',
    source: 'runtime/format/string',
    category: 'string',
  },
  {
    name: 'maskEmail',
    package: '@webpresso/webpresso',
    source: 'runtime/format/string',
    category: 'string',
  },
  {
    name: 'countWords',
    package: '@webpresso/webpresso',
    source: 'runtime/format/string',
    category: 'string',
  },
  {
    name: 'containsIgnoreCase',
    package: '@webpresso/webpresso',
    source: 'runtime/format/string',
    category: 'string',
  },
  {
    name: 'randomString',
    package: '@webpresso/webpresso',
    source: 'runtime/format/string',
    category: 'string',
  },
  {
    name: 'levenshteinDistance',
    package: '@webpresso/webpresso',
    source: 'runtime/format/string',
    category: 'string',
  },
  {
    name: 'closestMatch',
    package: '@webpresso/webpresso',
    source: 'runtime/format/string',
    category: 'string',
  },
  {
    name: 'findClosestMatch',
    package: '@webpresso/webpresso',
    source: 'runtime/format/string',
    category: 'string',
  },
  {
    name: 'escapeRegex',
    package: '@webpresso/webpresso',
    source: 'runtime/format/string',
    category: 'string',
  },
  {
    name: 'formatBytes',
    package: '@webpresso/webpresso',
    source: 'runtime/format/format',
    category: 'format',
  },
  {
    name: 'formatNumber',
    package: '@webpresso/webpresso',
    source: 'runtime/format/format',
    category: 'format',
  },
  {
    name: 'formatPercentage',
    package: '@webpresso/webpresso',
    source: 'runtime/format/format',
    category: 'format',
  },
  {
    name: 'formatPhoneNumber',
    package: '@webpresso/webpresso',
    source: 'runtime/format/format',
    category: 'format',
  },
  {
    name: 'formatDate',
    package: '@webpresso/webpresso',
    source: 'runtime/format/date',
    category: 'date',
  },
  {
    name: 'formatRelativeTime',
    package: '@webpresso/webpresso',
    source: 'runtime/format/date',
    category: 'date',
  },
  {
    name: 'addDays',
    package: '@webpresso/webpresso',
    source: 'runtime/format/date',
    category: 'date',
  },
  {
    name: 'subtractDays',
    package: '@webpresso/webpresso',
    source: 'runtime/format/date',
    category: 'date',
  },
  {
    name: 'isToday',
    package: '@webpresso/webpresso',
    source: 'runtime/format/date',
    category: 'date',
  },
  {
    name: 'isWithinDays',
    package: '@webpresso/webpresso',
    source: 'runtime/format/date',
    category: 'date',
  },
  {
    name: 'startOfDay',
    package: '@webpresso/webpresso',
    source: 'runtime/format/date',
    category: 'date',
  },
  {
    name: 'endOfDay',
    package: '@webpresso/webpresso',
    source: 'runtime/format/date',
    category: 'date',
  },
  {
    name: 'formatDuration',
    package: '@webpresso/webpresso',
    source: 'runtime/format/duration',
    category: 'duration',
  },
  {
    name: 'generateId',
    package: '@webpresso/webpresso',
    source: 'runtime/utils/id',
    category: 'id',
  },
  {
    name: 'generateSlug',
    package: '@webpresso/webpresso',
    source: 'runtime/utils/id',
    category: 'id',
  },
  {
    name: 'generateSlugUnderscore',
    package: '@webpresso/webpresso',
    source: 'runtime/utils/id',
    category: 'id',
  },
  {
    name: 'getErrorMessage',
    package: '@webpresso/webpresso',
    source: 'runtime/format/errors',
    category: 'error',
  },
  {
    name: 'serializeError',
    package: '@webpresso/webpresso',
    source: 'runtime/format/errors',
    category: 'error',
  },
  {
    name: 'toError',
    package: '@webpresso/webpresso',
    source: 'runtime/format/errors',
    category: 'error',
  },
  {
    name: 'isRetryableError',
    package: '@webpresso/webpresso',
    source: 'runtime/format/errors',
    category: 'error',
  },
  {
    name: 'createErrorContext',
    package: '@webpresso/webpresso',
    source: 'runtime/format/errors',
    category: 'error',
  },
]

const IMPL_PATTERN = (name: string) =>
  new RegExp(
    `(?:function\\s+${name}\\s*\\(|(?:const|let|var)\\s+${name}\\s*=\\s*(?:function|\\())`,
    'm',
  )

export function validatePackageImports(
  input: ToolInput,
): ValidationResult | DuplicateFunctionResult {
  if (process.env[SKIP_ENV_VAR] === '1') return createSkipResult(VALIDATOR_NAME)

  const filePath = getFilePath(input)
  const content = getContent(input)

  if (!content || !filePath) return { validator: VALIDATOR_NAME, passed: true }
  if (!/\.(ts|tsx|js|jsx)$/.test(filePath)) return { validator: VALIDATOR_NAME, passed: true }

  // Skip the package itself to avoid false positives
  if (
    SHARED_FUNCTIONS.some(
      (fn) =>
        filePath.includes(`/${fn.source}/`) ||
        filePath.includes(`/${fn.package.replace('@', '').replace('/', '-')}/`),
    )
  ) {
    return { validator: VALIDATOR_NAME, passed: true }
  }

  for (const fn of SHARED_FUNCTIONS) {
    if (IMPL_PATTERN(fn.name).test(content)) {
      const importPath = fn.source ? `${fn.package}/${fn.source}` : fn.package
      return {
        validator: VALIDATOR_NAME,
        passed: false,
        message: `Local implementation of "${fn.name}" detected. Import from ${importPath} instead.`,
        functionName: fn.name,
        suggestion: `import { ${fn.name} } from '${importPath}'`,
        package: fn.package,
        source: fn.source,
      }
    }
  }

  return { validator: VALIDATOR_NAME, passed: true }
}
