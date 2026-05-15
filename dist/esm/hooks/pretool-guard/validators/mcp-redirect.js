import { isMcpReady } from '#hooks/shared/mcp-sentinel';
const DEFAULT_SERVER_NAME = 'agent-kit';
const DEFAULT_TOOL_PREFIX = 'ak_';
export function resolveMcpReady(value) {
    if (typeof value === 'function')
        return value();
    if (typeof value === 'boolean')
        return value;
    return isMcpReady();
}
export function resolveMcpConfig(mcp) {
    return {
        serverName: mcp?.serverName?.trim() || DEFAULT_SERVER_NAME,
        toolPrefix: mcp?.toolPrefix?.trim() || DEFAULT_TOOL_PREFIX,
    };
}
function toolSuffixForCategory(category) {
    switch (category) {
        case 'test':
            return 'test';
        case 'lint':
            return 'lint';
        case 'typecheck':
            return 'typecheck';
        case 'format':
            return 'format';
        case 'blueprint':
            return 'blueprint';
        case 'unknown':
        default:
            return 'qa';
    }
}
export function buildRedirectMessage(ctx) {
    const fallbackHint = ctx.fallbackHint ?? 'just <task> [target]';
    if (!resolveMcpReady(ctx.mcpReady)) {
        return `"${ctx.command}" denied — MCP not ready. Use: ${fallbackHint}`;
    }
    const { serverName, toolPrefix } = resolveMcpConfig(ctx.mcp);
    const toolMatcher = `mcp__${serverName}__${toolPrefix}${toolSuffixForCategory(ctx.category)}(...)`;
    return [
        `"${ctx.command}" denied — use agent-kit MCP tool:`,
        `  ${toolMatcher}`,
        'Returns structured, summary-first results. Raw output is clipped; overflow may include a log path for deeper investigation.',
        `Fallback if MCP unavailable: ${fallbackHint}`,
    ].join('\n');
}
//# sourceMappingURL=mcp-redirect.js.map