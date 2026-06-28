import { createTransformResult } from "./metadata.js";
export function passthroughTransform(rawOutput, context) {
    if (!rawOutput)
        return {};
    return createTransformResult(rawOutput, rawOutput, context, {
        tier: 3,
        failures: [],
        legacyTier: "passthrough",
    });
}
//# sourceMappingURL=passthrough.js.map