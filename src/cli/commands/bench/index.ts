import type { CAC } from 'cac'

import {
  getBenchSessionMemoryHelpText,
  runBenchSessionMemoryCommand,
} from '#cli/commands/bench/session-memory.js'

export function registerBenchCommand(cli: CAC): void {
  cli
    .command('bench session-memory', getBenchSessionMemoryHelpText())
    .option('--scenario <id>', 'Scenario id or "all"', { default: 'all' })
    .option('--variant <id>', 'Single variant id to run')
    .option('--all-variants', 'Run baseline, context-mode, v1, and v2')
    .option('--dry-run', 'Validate manifest, scenarios, and env without API calls')
    .option('--trials <n>', 'Trials per cell')
    .option('--model <name>', 'Pricing model alias to use for cost math')
    .option('--output-root <path>', 'Override the bench output root directory')
    .action(
      async (options: {
        allVariants?: boolean
        dryRun?: boolean
        model?: string
        outputRoot?: string
        scenario?: string
        trials?: string | number
        variant?: string
      }) => {
        const result = await runBenchSessionMemoryCommand({
          allVariants: Boolean(options.allVariants),
          dryRun: Boolean(options.dryRun),
          model: options.model,
          outputRoot: options.outputRoot,
          scenario: options.scenario,
          trials:
            typeof options.trials === 'number'
              ? options.trials
              : typeof options.trials === 'string'
                ? Number.parseInt(options.trials, 10)
                : undefined,
          variant: options.variant,
        })

        console.log(
          JSON.stringify(
            {
              exitCode: result.exitCode,
              runId: result.runId,
              dryRun: result.dryRun,
              reportPath: result.reportPath,
              cellCount: result.cellCount,
            },
            null,
            2,
          ),
        )

        process.exit(result.exitCode)
      },
    )
}
