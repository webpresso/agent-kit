const MANAGED_TOOL_PREFIX = {
    playwright: { command: 'vp', args: ['exec', 'playwright'] },
    vitest: { command: 'vp', args: ['exec', 'vitest'] },
    vp: { command: 'vp', args: [] },
};
function withOptionalRtk(resolution, filterOutput) {
    if (!filterOutput)
        return resolution;
    return {
        ...resolution,
        command: 'rtk',
        args: [resolution.command, ...resolution.args],
    };
}
export function resolveRunner(tool, options = {}) {
    const normalized = tool.trim();
    if (!normalized) {
        throw new Error('tool runtime resolution requires a non-empty tool name');
    }
    const filterOutput = options.filterOutput ?? true;
    const managed = MANAGED_TOOL_PREFIX[normalized];
    if (managed) {
        return withOptionalRtk({
            tool: normalized,
            command: managed.command,
            args: [...managed.args],
            source: 'managed',
        }, filterOutput);
    }
    if (options.fallbackCommand) {
        return withOptionalRtk({
            tool: normalized,
            command: options.fallbackCommand,
            args: [...(options.fallbackArgs ?? [])],
            source: 'fallback',
        }, filterOutput);
    }
    throw new Error(`No managed runtime runner is defined for tool "${normalized}"`);
}
//# sourceMappingURL=resolve-runner.js.map