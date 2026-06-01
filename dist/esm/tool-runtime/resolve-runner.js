const MANAGED_TOOL_PREFIX = {
    oxfmt: { command: 'vp', args: ['exec', 'oxfmt'] },
    playwright: { command: 'vp', args: ['exec', 'playwright'] },
    tsc: { command: 'vp', args: ['exec', 'tsc'] },
    vitest: { command: 'vp', args: ['exec', 'vitest'] },
    vp: { command: 'vp', args: [] },
};
function withOptionalRtk(resolution, outputPolicy) {
    if (outputPolicy !== 'rtk-filtered')
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
    const outputPolicy = options.outputPolicy ?? (options.filterOutput === false ? 'structured' : 'rtk-filtered');
    const managed = MANAGED_TOOL_PREFIX[normalized];
    if (managed) {
        return withOptionalRtk({
            tool: normalized,
            command: managed.command,
            args: [...managed.args],
            source: 'managed',
        }, outputPolicy);
    }
    if (options.fallbackCommand) {
        return withOptionalRtk({
            tool: normalized,
            command: options.fallbackCommand,
            args: [...(options.fallbackArgs ?? [])],
            source: 'fallback',
        }, outputPolicy);
    }
    throw new Error(`No managed runtime runner is defined for tool "${normalized}"`);
}
//# sourceMappingURL=resolve-runner.js.map