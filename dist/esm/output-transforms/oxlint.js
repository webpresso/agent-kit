import { createTransformResult } from './metadata.js';
import { passthroughTransform } from './passthrough.js';
export function oxlintTransform(rawOutput, context) {
    if (!rawOutput)
        return {};
    const reports = parseOxlintJson(rawOutput);
    if (!reports)
        return regexFallback(rawOutput, context);
    const failures = reports.flatMap((report) => {
        const file = report.filePath ?? report.file_path ?? report.filename ?? '<unknown>';
        const messages = report.messages ?? report.diagnostics ?? [];
        return Array.isArray(messages)
            ? messages.map((message) => {
                const line = typeof message.line === 'number'
                    ? message.line
                    : typeof message.span?.start?.line === 'number'
                        ? message.span.start.line
                        : 0;
                const ruleId = message.ruleId ?? message.rule_id;
                return {
                    file,
                    line,
                    code: ruleId ?? undefined,
                    message: message.message ?? '',
                };
            })
            : [];
    });
    return compactResult(rawOutput, context, failures, 1);
}
function parseOxlintJson(rawOutput) {
    try {
        const parsed = JSON.parse(rawOutput.trim());
        if (Array.isArray(parsed))
            return parsed;
        if (parsed && typeof parsed === 'object') {
            const wrapper = parsed;
            const reports = wrapper.diagnostics ?? wrapper.results;
            if (Array.isArray(reports)) {
                if (reports.every((report) => report && typeof report === 'object' && 'message' in report)) {
                    return reports.map((report) => {
                        const message = report;
                        return {
                            filePath: message.filename,
                            messages: [
                                {
                                    line: message.line ?? message.labels?.[0]?.span?.line,
                                    ruleId: message.ruleId ?? message.rule_id ?? 'parse',
                                    message: message.message,
                                },
                            ],
                        };
                    });
                }
                return reports;
            }
        }
        return undefined;
    }
    catch {
        return undefined;
    }
}
function regexFallback(rawOutput, context) {
    const failures = rawOutput
        .split(/\r?\n/u)
        .filter((line) => /error|warning/iu.test(line))
        .slice(0, 80)
        .map((line) => ({ message: line.trim() }));
    if (failures.length === 0)
        return passthroughTransform(rawOutput, context);
    return compactResult(rawOutput, context, failures, 2);
}
function compactResult(rawOutput, context, failures, tier) {
    const lines = failures.map((failure) => {
        const location = failure.file ? `${failure.file}:${failure.line ?? 0}` : undefined;
        const code = failure.code ? ` ${failure.code}` : '';
        return `${location ?? ''}${code} ${failure.message}`.trim();
    });
    return createTransformResult(rawOutput, lines.join('\n'), context, {
        tier,
        failures,
    });
}
//# sourceMappingURL=oxlint.js.map