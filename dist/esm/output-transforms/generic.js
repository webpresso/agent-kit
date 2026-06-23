import { createTransformResult } from './metadata.js';
import { passthroughTransform } from './passthrough.js';
const ERROR_LINE_RE = /error|fail|✗|✘/iu;
export function genericTransform(rawOutput, context) {
    if (!rawOutput)
        return {};
    const failures = rawOutput
        .split(/\r?\n/u)
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && ERROR_LINE_RE.test(line))
        .map((line) => ({ message: line }));
    if (failures.length === 0)
        return passthroughTransform(rawOutput, context);
    return createTransformResult(rawOutput, failures.map((failure) => failure.message).join('\n'), context, {
        tier: 3,
        failures,
        legacyTier: 'registered',
    });
}
//# sourceMappingURL=generic.js.map