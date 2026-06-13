import { runStdioServer } from '#mcp/cli';
export const MCP_COMMAND_HELP = [
    'Run the webpresso MCP server (stdio transport).',
    '',
    'Speaks the Model Context Protocol over stdin/stdout. Intended to be invoked',
    'by a Claude Code plugin manifest entry (`mcpServers.webpresso`) or any MCP',
    'client. Tools are auto-discovered from `dist/esm/mcp/tools/*.js`.',
    '',
    'Examples:',
    '  wp mcp',
].join('\n');
export function registerMcpCommand(cli) {
    cli.command('mcp', MCP_COMMAND_HELP).action(async () => {
        await runStdioServer();
        return 0;
    });
}
//# sourceMappingURL=mcp.js.map