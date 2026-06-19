import type { CAC } from 'cac'

import { runDeployPlan } from '#deploy/run.js'

export function registerCleanupCommand(cli: CAC): void {
  cli
    .command('cleanup <target>', 'Cleanup commands (currently preview teardown)')
    .option('--lane <lane>', 'Preview lane id', { default: 'preview_main' })
    .option('--json', 'Print the validated destroy plan JSON without executing')
    .action(async (target: string, flags: Record<string, unknown>) => {
      if (target !== 'preview') {
        process.stderr.write(`Unknown cleanup target: ${target}. Use "preview".\n`)
        return 1
      }
      return runDeployPlan({
        cwd: process.cwd(),
        lane: (flags.lane as string | undefined) ?? 'preview_main',
        destroy: true,
        dryRun: !flags.execute,
        planJson: Boolean(flags.json),
      })
    })
}
