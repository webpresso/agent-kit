export function shouldCompact(options = {}) {
    if (options.flag !== undefined)
        return options.flag;
    const sourceEnv = options.env ?? process.env;
    const envValue = sourceEnv.QUALITY_ENGINE_COMPACT ?? sourceEnv.WP_COMPACT;
    if (envValue !== undefined)
        return parseBooleanEnv(envValue);
    const isTTY = options.isTTY ?? process.stdout.isTTY ?? false;
    return !isTTY;
}
function parseBooleanEnv(value) {
    return !['0', 'false', 'no', 'off'].includes(value.trim().toLowerCase());
}
//# sourceMappingURL=should-compact.js.map