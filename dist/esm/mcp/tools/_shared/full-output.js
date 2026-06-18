import { applyOutputTransform } from '#output-transforms/index';
import { stripTransform } from './runner-failure.js';
export function formatMcpToolOutput(rawOutput, options) {
    if (!rawOutput)
        return {};
    if (options.full)
        return { rawOutput };
    return stripTransform(applyOutputTransform(rawOutput, { toolName: options.toolName }));
}
//# sourceMappingURL=full-output.js.map