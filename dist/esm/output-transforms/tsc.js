import { createTransformResult } from "./metadata.js";
import { passthroughTransform } from "./passthrough.js";
const TSC_ERROR_RE = /^(.+?)(?:\((\d+),\d+\)|:(\d+):\d+)(?::\s*|\s+-\s+)error TS(\d+):\s*(.*)$/gmu;
export function tscTransform(rawOutput, context) {
    if (!rawOutput)
        return {};
    const errors = parseTscErrors(rawOutput);
    if (errors.length === 0)
        return passthroughTransform(rawOutput, context);
    const byKey = new Map();
    for (const error of errors) {
        const key = `${error.file}:${error.line}:TS${error.code}:${error.message}`;
        const existing = byKey.get(key);
        if (existing) {
            byKey.set(key, { ...existing, count: existing.count + 1 });
        }
        else {
            byKey.set(key, { ...error, count: 1 });
        }
    }
    const compactErrors = [...byKey.values()];
    return createTransformResult(rawOutput, compactErrors
        .map((error) => {
        const suffix = error.count > 1 ? ` (x${error.count})` : "";
        return `${error.file}:${error.line} TS${error.code} ${error.message}${suffix}`;
    })
        .join("\n"), context, {
        tier: 1,
        failures: compactErrors.map((error) => ({
            file: error.file,
            line: error.line,
            code: `TS${error.code}`,
            message: error.message,
        })),
    });
}
function parseTscErrors(output) {
    return [...output.matchAll(TSC_ERROR_RE)].map((match) => ({
        file: match[1] ?? "",
        line: Number(match[2] ?? match[3] ?? 0),
        code: match[4] ?? "",
        message: match[5] ?? "",
    }));
}
//# sourceMappingURL=tsc.js.map