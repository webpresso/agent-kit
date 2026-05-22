import type { CAC } from 'cac'

import { runStdioServer } from '#mcp/cli'

export const MCP_COMMAND_HELP = [
  'Run the agent-kit MCP server (stdio transport).',
  '',
  'Speaks the Model Context Protocol over stdin/stdout. Intended to be invoked',
  'by a Claude Code plugin manifest entry (`mcpServers.agent-kit`) or any MCP',
  'client. Tools are auto-discovered from `dist/esm/mcp/tools/*.js`.',
  '',
  'Examples:',
  '  wp mcp',
].join('\n')

export function registerMcpCommand(cli: CAC): void {
  cli.command('mcp', MCP_COMMAND_HELP).action(async () => {
    await runStdioServer()
    return 0
  })
}
