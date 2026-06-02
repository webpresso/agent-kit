import type { CAC } from 'cac'

import { runDeployPlan } from '#deploy/run.js'

export const DEPLOY_COMMAND_HELP = [
  'Run a consumer-owned deploy adapter through the managed wp deploy surface.',
  '',
  'Examples:',
  '  wp deploy --lane prd --dry-run',
  '  wp deploy --lane preview_pr_123 --plan-json',
].join('\n')

export function registerDeployCommand(cli: CAC): void {
  cli
    .command('deploy', DEPLOY_COMMAND_HELP)
    .option('--lane <lane>', 'Deploy lane: dev, preview_main, preview_pr_<n>, or prd')
    .option('--dry-run', 'Ask the adapter for its dry-run deploy plan')
    .option('--plan-json', 'Print the validated deploy plan JSON without executing steps')
    .action(async (options: Record<string, unknown>) => {
      const lane = typeof options.lane === 'string' ? options.lane : undefined
      if (!lane) {
        console.error('Usage: wp deploy --lane <dev|preview_main|preview_pr_<n>|prd>')
        return 1
      }
      try {
        return await runDeployPlan({
          cwd: process.cwd(),
          lane,
          dryRun: Boolean(options.dryRun),
          planJson: Boolean(options.planJson),
        })
      } catch (error) {
        console.error(error instanceof Error ? error.message : String(error))
        return 1
      }
    })
}
