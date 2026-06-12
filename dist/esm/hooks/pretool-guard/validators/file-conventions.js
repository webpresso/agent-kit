import { getFilePath } from '#hooks/shared/types';
import { createSkipResult } from './skip-result.js';
import { getBlueprintPathViolation, getNonCanonicalPlanningPathViolation, isBlueprintPath, } from './path-contract.js';
const SYSTEM_PATH_PREFIXES = [
    '/etc/',
    '/usr/',
    '/bin/',
    '/sbin/',
    '/var/',
    '/sys/',
    '/proc/',
    '/dev/',
];
function validateNotSystemPath(filePath) {
    if (!filePath.startsWith('/'))
        return undefined;
    for (const prefix of SYSTEM_PATH_PREFIXES) {
        if (filePath.startsWith(prefix) || filePath === prefix.slice(0, -1)) {
            return {
                validator: 'file-conventions',
                passed: false,
                message: `Cannot write to system path: ${filePath}`,
            };
        }
    }
    return undefined;
}
export function validateFileConventions(input) {
    if (process.env.FILE_CONVENTIONS_SKIP === '1')
        return createSkipResult('file-conventions');
    const filePath = getFilePath(input);
    if (!filePath)
        return { validator: 'file-conventions', passed: true };
    const systemPathResult = validateNotSystemPath(filePath);
    if (systemPathResult)
        return systemPathResult;
    const normalized = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    if (/\/generated\//.test(filePath)) {
        return {
            validator: 'file-conventions',
            passed: false,
            message: `Cannot edit files inside generated/ directories. These are auto-generated and should not be modified manually.`,
        };
    }
    const nonCanonicalPlanningViolation = getNonCanonicalPlanningPathViolation(normalized);
    if (nonCanonicalPlanningViolation) {
        return { validator: 'file-conventions', passed: false, message: nonCanonicalPlanningViolation };
    }
    const blueprintPathViolation = getBlueprintPathViolation(normalized, undefined, input.cwd);
    if (blueprintPathViolation) {
        return { validator: 'file-conventions', passed: false, message: blueprintPathViolation };
    }
    if (!isBlueprintPath(normalized) || normalized.endsWith('.md')) {
        return { validator: 'file-conventions', passed: true };
    }
    const parts = normalized.split('/');
    const planDir = parts[3];
    if (planDir && !/^[a-z0-9-]+$/.test(planDir)) {
        return {
            validator: 'file-conventions',
            passed: false,
            message: `Implementation plan directories must be kebab-case. Got: ${planDir}`,
        };
    }
    return { validator: 'file-conventions', passed: true };
}
//# sourceMappingURL=file-conventions.js.map