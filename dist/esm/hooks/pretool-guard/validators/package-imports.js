import { getContent, getFilePath } from '#hooks/shared/types';
import { createSkipResult } from './skip-result.js';
export const VALIDATOR_NAME = 'package-imports';
export const SKIP_ENV_VAR = 'PACKAGE_IMPORTS_SKIP';
export const SHARED_FUNCTIONS = [
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
    { name: 'levenshteinDistance', package: '@webpresso/utils', source: 'string', category: 'string' },
    { name: 'closestMatch', package: '@webpresso/utils', source: 'string', category: 'string' },
    { name: 'findClosestMatch', package: '@webpresso/utils', source: 'string', category: 'string' },
    { name: 'escapeRegex', package: '@webpresso/utils', source: 'string', category: 'string' },
    { name: 'formatBytes', package: '@webpresso/utils', source: 'format', category: 'format' },
    { name: 'formatNumber', package: '@webpresso/utils', source: 'format', category: 'format' },
    { name: 'formatPercentage', package: '@webpresso/utils', source: 'format', category: 'format' },
    { name: 'formatPhoneNumber', package: '@webpresso/utils', source: 'format', category: 'format' },
    { name: 'formatDate', package: '@webpresso/utils', source: 'date', category: 'date' },
    { name: 'formatRelativeTime', package: '@webpresso/utils', source: 'date', category: 'date' },
    { name: 'addDays', package: '@webpresso/utils', source: 'date', category: 'date' },
    { name: 'subtractDays', package: '@webpresso/utils', source: 'date', category: 'date' },
    { name: 'isToday', package: '@webpresso/utils', source: 'date', category: 'date' },
    { name: 'isWithinDays', package: '@webpresso/utils', source: 'date', category: 'date' },
    { name: 'startOfDay', package: '@webpresso/utils', source: 'date', category: 'date' },
    { name: 'endOfDay', package: '@webpresso/utils', source: 'date', category: 'date' },
    { name: 'formatDuration', package: '@webpresso/utils', source: 'duration', category: 'duration' },
    { name: 'generateId', package: '@webpresso/utils', source: 'id', category: 'id' },
    { name: 'generateSlug', package: '@webpresso/utils', source: 'id', category: 'id' },
    { name: 'generateSlugUnderscore', package: '@webpresso/utils', source: 'id', category: 'id' },
    { name: 'getErrorMessage', package: '@webpresso/utils', source: 'errors', category: 'error' },
    { name: 'serializeError', package: '@webpresso/utils', source: 'errors', category: 'error' },
    { name: 'toError', package: '@webpresso/utils', source: 'errors', category: 'error' },
    { name: 'isRetryableError', package: '@webpresso/utils', source: 'errors', category: 'error' },
    { name: 'createErrorContext', package: '@webpresso/utils', source: 'errors', category: 'error' },
];
const IMPL_PATTERN = (name) => new RegExp(`(?:function\\s+${name}\\s*\\(|(?:const|let|var)\\s+${name}\\s*=\\s*(?:function|\\())`, 'm');
export function validatePackageImports(input) {
    if (process.env[SKIP_ENV_VAR] === '1')
        return createSkipResult(VALIDATOR_NAME);
    const filePath = getFilePath(input);
    const content = getContent(input);
    if (!content || !filePath)
        return { validator: VALIDATOR_NAME, passed: true };
    if (!/\.(ts|tsx|js|jsx)$/.test(filePath))
        return { validator: VALIDATOR_NAME, passed: true };
    // Skip the package itself to avoid false positives
    if (SHARED_FUNCTIONS.some((fn) => filePath.includes(`/${fn.source}/`) || filePath.includes(`/${fn.package.replace('@', '').replace('/', '-')}/`))) {
        return { validator: VALIDATOR_NAME, passed: true };
    }
    for (const fn of SHARED_FUNCTIONS) {
        if (IMPL_PATTERN(fn.name).test(content)) {
            const importPath = fn.source ? `${fn.package}/${fn.source}` : fn.package;
            return {
                validator: VALIDATOR_NAME,
                passed: false,
                message: `Local implementation of "${fn.name}" detected. Import from ${importPath} instead.`,
                functionName: fn.name,
                suggestion: `import { ${fn.name} } from '${importPath}'`,
                package: fn.package,
                source: fn.source,
            };
        }
    }
    return { validator: VALIDATOR_NAME, passed: true };
}
//# sourceMappingURL=package-imports.js.map