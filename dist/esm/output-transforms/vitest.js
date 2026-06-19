import { createTransformResult } from './metadata.js';
import { passthroughTransform } from './passthrough.js';
export function vitestTransform(rawOutput, context) {
    if (!rawOutput)
        return {};
    const parsed = parseJsonish(rawOutput);
    if (parsed !== undefined) {
        const failures = collectFailures(parsed);
        if (failures.length > 0)
            return compact(rawOutput, context, failures, 1);
        const diagnostic = summarizeUnsuccessfulJsonRun(parsed);
        if (diagnostic)
            return compact(rawOutput, context, [diagnostic], 1);
        return compact(rawOutput, context, failures, 1);
    }
    const fallback = regexFallback(rawOutput);
    if (fallback.length > 0)
        return compact(rawOutput, context, fallback, 2);
    return passthroughTransform(rawOutput, context);
}
function parseJsonish(rawOutput) {
    const json = extractJson(rawOutput);
    if (!json)
        return undefined;
    try {
        return JSON.parse(json);
    }
    catch {
        return undefined;
    }
}
function extractJson(rawOutput) {
    const start = rawOutput.search(/[[{]/u);
    if (start < 0)
        return undefined;
    const open = rawOutput[start];
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let index = start; index < rawOutput.length; index += 1) {
        const char = rawOutput[index];
        if (inString) {
            if (escaped) {
                escaped = false;
            }
            else if (char === '\\') {
                escaped = true;
            }
            else if (char === '"') {
                inString = false;
            }
            continue;
        }
        if (char === '"')
            inString = true;
        if (char === open)
            depth += 1;
        if (char === close)
            depth -= 1;
        if (depth === 0)
            return rawOutput.slice(start, index + 1);
    }
    return undefined;
}
function collectFailures(value) {
    const failures = [];
    visit(value, undefined, failures);
    return failures;
}
function summarizeUnsuccessfulJsonRun(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return undefined;
    const record = value;
    if (record.success !== false)
        return undefined;
    const totalTests = numericField(record.numTotalTests);
    const totalSuites = numericField(record.numTotalTestSuites);
    const testResults = Array.isArray(record.testResults) ? record.testResults : undefined;
    if (totalTests !== 0 && totalSuites !== 0 && testResults?.length !== 0)
        return undefined;
    return {
        name: '<vitest>',
        message: 'Vitest exited unsuccessfully but reported 0 tests. Check that the requested file filter matches a Vitest-included test file.',
    };
}
function numericField(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
function visit(value, inheritedFile, failures) {
    if (!value || typeof value !== 'object')
        return;
    if (Array.isArray(value)) {
        for (const item of value)
            visit(item, inheritedFile, failures);
        return;
    }
    const record = value;
    const file = firstString(record.file, record.filepath, record.filePath, record.name?.toString().endsWith('.ts') ? record.name : undefined) ?? inheritedFile;
    const status = firstString(record.status, record.state);
    const failureMessages = Array.isArray(record.failureMessages)
        ? record.failureMessages.filter((item) => typeof item === 'string')
        : typeof record.failureMessage === 'string'
            ? [record.failureMessage]
            : [];
    if (status && /fail|failed/iu.test(status) && failureMessages.length > 0) {
        failures.push({
            file,
            name: firstString(record.fullName, record.title, record.name) ?? '<unnamed test>',
            message: firstStackLine(failureMessages[0] ?? 'failed'),
        });
    }
    for (const item of Object.values(record))
        visit(item, file, failures);
}
function firstString(...values) {
    return values.find((value) => typeof value === 'string' && value.length > 0);
}
function firstStackLine(message) {
    return (message
        .split(/\r?\n/u)
        .find((line) => line.trim().length > 0)
        ?.trim() ?? message);
}
function regexFallback(rawOutput) {
    return rawOutput
        .split(/\r?\n/u)
        .filter((line) => /FAIL|failed|Error:/u.test(line))
        .slice(0, 20)
        .map((line) => ({ name: '<summary>', message: line.trim() }));
}
function compact(rawOutput, context, failures, tier) {
    const structuredFailures = failures.map((failure) => ({
        file: failure.file,
        message: `${failure.name}: ${failure.message}`,
    }));
    return createTransformResult(rawOutput, failures
        .map((failure) => `${failure.file ? `${failure.file} ` : ''}${failure.name}: ${failure.message}`)
        .join('\n'), context, {
        tier,
        failures: structuredFailures,
    });
}
//# sourceMappingURL=vitest.js.map