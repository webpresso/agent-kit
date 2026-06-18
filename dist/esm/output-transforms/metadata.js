import { clipRawOutput } from '#mcp/tools/_shared/result';
export function createTransformResult(rawOutput, compactOutput, context, options) {
    const rawBytes = Buffer.byteLength(rawOutput);
    const clipped = clipRawOutput(compactOutput, context.maxChars, {
        toolName: context.toolName,
        persistOverflow: context.persistOverflow,
    });
    const bytes = Buffer.byteLength(clipped.rawOutput ?? compactOutput);
    return {
        ...clipped,
        ...(compactOutput.length === 0 ? { rawOutput: '' } : {}),
        failures: [...(options.failures ?? [])],
        tier: options.tier,
        bytes,
        tokensSaved: Math.max(0, rawBytes - bytes),
        transform: {
            toolName: context.toolName,
            normalizedToolName: context.normalizedToolName,
            tier: options.legacyTier ?? 'registered',
            rawBytes,
        },
    };
}
//# sourceMappingURL=metadata.js.map