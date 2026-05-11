import { getContent, getFilePath } from '#hooks/shared/types';
import { createSkipResult } from './skip-result.js';
const MAX_FILE_LINES = 500;
export function validateComplexity(input) {
    if (process.env.COMPLEXITY_WARNING_SKIP === '1')
        return createSkipResult('complexity');
    const filePath = getFilePath(input);
    const content = getContent(input);
    if (!content || !filePath)
        return { validator: 'complexity', passed: true };
    const hasExtension = /\.[^/]+$/.test(filePath);
    if (hasExtension && !/\.(ts|tsx|js|jsx)$/.test(filePath))
        return { validator: 'complexity', passed: true };
    const lines = content.split('\n').length;
    if (lines > MAX_FILE_LINES) {
        return {
            validator: 'complexity',
            passed: true,
            message: `Warning: File has ${lines} lines (>${MAX_FILE_LINES}). Consider splitting.`,
        };
    }
    return { validator: 'complexity', passed: true };
}
//# sourceMappingURL=complexity.js.map