import type { CAC } from 'cac'

import { printHooksDoctor } from '#hooks/doctor'

export function registerHooksCommand(cli: CAC): void {
  cli
    .command('hooks doctor', 'Verify plugin hook installation health')
    .option('--skip-mcp', 'Skip MCP server liveness check (for CI)')
    .action(async (options: { skipMcp?: boolean }) => {
      const code = await printHooksDoctor({ skipMcp: options.skipMcp })
      process.exit(code)
    })
}
