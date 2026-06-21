import type { CAC } from 'cac'

import { printHooksDoctor } from '#hooks/doctor'

type HooksCommandOptions = {
  skipMcp?: boolean
  fix?: boolean
  hosts?: 'auto' | 'skip' | 'required'
  host?: Array<'codex' | 'opencode' | 'claude'> | 'codex' | 'opencode' | 'claude'
  dryRun?: boolean
  vendor?: string
  tool?: string
  workspace?: boolean
  apply?: boolean
  json?: boolean
  limit?: string
}

async function runDoctor(options: HooksCommandOptions): Promise<number> {
  const hostNames = Array.isArray(options.host)
    ? options.host
    : options.host
      ? [options.host]
      : undefined

  return await printHooksDoctor({
    skipMcp: options.skipMcp,
    fix: options.fix,
    hosts: options.hosts,
    hostNames,
  })
}

export function registerHooksCommand(cli: CAC): void {
  cli
    .command(
      'hooks [subcommand] [...args]',
      'Verify plugin hook installation health (subcommands: doctor, status, errors, dispatch, demo, upgrade)',
    )
    .option('--skip-mcp', 'Skip MCP server liveness check (for CI)')
    .option(
      '--fix',
      'Attempt the safe manifest-backed hook restore path when doctor finds fixable drift',
    )
    .option('--hosts <mode>', 'Host smoke mode: auto | skip | required', {
      default: 'auto',
    })
    .option('--host <name>', 'Restrict host checks to codex | opencode | claude', {
      default: [],
    })
    .option('--vendor <vendor>', 'Agent CLI to inspect/read hook config from: claude | codex')
    .option(
      '--tool <tool>',
      'Simulated tool name for hooks demo matcher routing, e.g. Bash or Write',
    )
    .option('--dry-run', 'Print hooks that would fire without executing them (default: true)')
    .option('--workspace', 'Target every repo listed in ~/.agent/workspace.yaml')
    .option('--apply', 'Write the upgrade instead of previewing it')
    .option('--json', 'Print machine-readable JSON for supported hooks subcommands')
    .option('--limit <n>', 'Limit rows for supported hooks subcommands', { default: undefined })
    .action(
      async (subcommand: string | undefined, args: string[], options: HooksCommandOptions) => {
        switch (subcommand) {
          case undefined:
          case 'doctor':
            return await runDoctor(options)
          case 'status': {
            const { statusCommand } = await import('#hooks/status/index.js')
            const extraArgs = options.vendor ? ['--vendor', options.vendor] : []
            await statusCommand(extraArgs)
            return
          }
          case 'errors': {
            const { hooksErrorsCommand } = await import('#hooks/errors/index.js')
            const extraArgs: string[] = []
            if (options.json === true) extraArgs.push('--json')
            if (options.limit !== undefined) extraArgs.push('--limit', String(options.limit))
            await hooksErrorsCommand(extraArgs)
            return
          }
          case 'dispatch': {
            const event = args[0]
            if (!event) {
              throw new Error('Usage: wp hooks dispatch <event>')
            }

            const { dispatchCommand } = await import('#hooks/dispatch/index.js')
            const vendorArg = options.vendor === 'codex' ? 'codex' : 'claude'
            const extraArgs: string[] = []
            if (options.dryRun === true) extraArgs.push('--dry-run')
            await dispatchCommand([event, '--vendor', vendorArg, ...extraArgs])
            return
          }
          case 'demo': {
            const event = args[0]
            if (!event) {
              throw new Error('Usage: wp hooks demo <event>')
            }

            const { demoCommand } = await import('#hooks/demo/index.js')
            const extraArgs: string[] = [event]
            if (options.vendor) extraArgs.push('--vendor', options.vendor)
            if (options.tool) extraArgs.push('--tool', options.tool)
            await demoCommand(extraArgs)
            return
          }
          case 'upgrade': {
            const { hooksUpgradeCommand } = await import('#cli/commands/hooks-upgrade/index.js')
            const extraArgs: string[] = []
            if (options.workspace === true) extraArgs.push('--workspace')
            if (options.apply === true) extraArgs.push('--apply')
            return await hooksUpgradeCommand(extraArgs)
          }
          default:
            throw new Error(
              `Unknown hooks subcommand: ${subcommand}\n\nUse one of: doctor, status, errors, dispatch, demo, upgrade`,
            )
        }
      },
    )
}
