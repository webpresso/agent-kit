import type { CAC } from 'cac'

interface E2eCommandOptions {
  file?: string
  suite?: string
}

export function registerE2eCommand(cli: CAC): void {
  cli
    .command('e2e [...args]', 'Run portable E2E suite/file commands')
    .option('--file <path>', 'Run E2E tests for a specific file')
    .option('--suite <name>', 'Just recipe/suite to run; defaults to e2e')
    .allowUnknownOptions()
    .action(async (args: string[], options: E2eCommandOptions) => {
      const { runAgentKitE2e } = await import('#e2e')
      const code = await runAgentKitE2e({
        file: options.file,
        suite: options.suite,
        passthrough: args,
      })
      process.exit(code)
    })
}
