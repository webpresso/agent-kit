import { applyOutputTransform } from "#output-transforms/index";
import { stripTransform } from "./runner-failure.js";
import { createSessionElisionRecorder } from "#mcp/_session-elision.js";
export function formatMcpToolOutput(rawOutput, options) {
    if (!rawOutput)
        return {};
    if (options.full)
        return { rawOutput };
    return stripTransform(applyOutputTransform(rawOutput, {
        toolName: options.toolName,
        elisionRecorder: createSessionElisionRecorder({
            cwd: options.cwd,
            sourcePrefix: options.toolName,
        }),
    }));
}
//# sourceMappingURL=full-output.js.map