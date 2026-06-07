import type { CAC } from 'cac'

import { printHooksDoctor } from '#hooks/doctor'

export function registerHooksCommand(cli: CAC): void {
  cli
    .command('hooks [action]', 'Verify plugin hook installation health (run: doctor)')
    .option('--skip-mcp', 'Skip MCP server liveness check (for CI)')
    .option('--hosts <mode>', 'Host smoke mode: auto | skip | required', {
      default: 'auto',
    })
    .option('--host <name>', 'Restrict host checks to codex | opencode | claude', {
      default: [],
    })
    .action(
      async (
        _action: string | undefined,
        options: {
          skipMcp?: boolean
          hosts?: 'auto' | 'skip' | 'required'
          host?: Array<'codex' | 'opencode' | 'claude'>
        },
      ) => {
        const code = await printHooksDoctor({
          skipMcp: options.skipMcp,
          hosts: options.hosts,
          hostNames: options.host,
        })
        return code
      },
    )

  cli
    .command(
      'hooks dispatch <event>',
      'Find hooks registered for an event and print what would fire (dry-run)',
    )
    .option('--dry-run', 'Print hooks that would fire without executing them (default: true)')
    .option('--vendor <vendor>', 'Agent CLI to read hook config from: claude | codex', {
      default: 'claude',
    })
    .action(
      async (
        event: string,
        options: {
          dryRun?: boolean
          vendor?: string
        },
      ) => {
        const { dispatchCommand } = await import('#hooks/dispatch/index.js')
        const vendorArg = options.vendor === 'codex' ? 'codex' : 'claude'
        const extraArgs: string[] = []
        if (options.dryRun === true) extraArgs.push('--dry-run')
        await dispatchCommand([event, '--vendor', vendorArg, ...extraArgs])
      },
    )
}
