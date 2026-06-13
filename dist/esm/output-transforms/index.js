import { genericTransform } from './generic.js';
import { oxlintTransform } from './oxlint.js';
import { tscTransform } from './tsc.js';
import { passthroughTransform } from './passthrough.js';
import { vitestTransform } from './vitest.js';
import { shouldCompact } from './should-compact.js';
const builtInTransforms = new Map([
    ['lint-oxlint', oxlintTransform],
    ['typecheck', tscTransform],
    ['test', vitestTransform],
]);
const transforms = new Map(builtInTransforms);
export function registerTransform(toolName, transform) {
    transforms.set(normalizeToolName(toolName), transform);
}
export function clearTransformsForTest() {
    transforms.clear();
    for (const [name, transform] of builtInTransforms)
        transforms.set(name, transform);
}
export function normalizeToolName(toolName) {
    const withoutPrefix = toolName.replace(/^wp_/u, '');
    if (withoutPrefix.startsWith('audit-'))
        return 'audit';
    if (withoutPrefix === 'lint' || withoutPrefix.startsWith('lint-'))
        return 'lint-oxlint';
    if (withoutPrefix === 'typecheck' || withoutPrefix.startsWith('typecheck-'))
        return 'typecheck';
    if (withoutPrefix === 'test' || withoutPrefix.startsWith('test-'))
        return 'test';
    return withoutPrefix;
}
export function applyOutputTransform(rawOutput, context) {
    if (!rawOutput)
        return {};
    const normalizedToolName = normalizeToolName(context.toolName);
    const fullContext = { ...context, normalizedToolName };
    if (!shouldCompact()) {
        return passthroughTransform(rawOutput, fullContext);
    }
    const transform = transforms.get(normalizedToolName);
    if (transform)
        return transform(rawOutput, fullContext);
    return genericTransform(rawOutput, fullContext);
}
export const applyTransform = applyOutputTransform;
//# sourceMappingURL=index.js.map