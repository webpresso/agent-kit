import type { CAC } from 'cac'

import { printHooksDoctor } from '#hooks/doctor'

export function registerHooksCommand(cli: CAC): void {
  cli
    .command('hooks [action]', 'Verify plugin hook installation health (run: doctor)')
    .option('--skip-mcp', 'Skip MCP server liveness check (for CI)')
    .action(async (_action: string | undefined, options: { skipMcp?: boolean }) => {
      const code = await printHooksDoctor({ skipMcp: options.skipMcp })
      return code
    })
}
