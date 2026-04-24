import type { CAC } from 'cac'

interface TestCommandOptions {
  file?: string
  package?: string
}

export function registerTestCommand(cli: CAC): void {
  cli
    .command('test [...args]', 'Run portable package/file test commands')
    .option('--file <path>', 'Run tests for a specific file')
    .option('--package <name>', 'Run tests for a workspace package')
    .allowUnknownOptions()
    .action(async (args: string[], options: TestCommandOptions) => {
      const { runAgentKitTest } = await import('#test')
      const code = await runAgentKitTest({
        file: options.file,
        package: options.package,
        passthrough: args,
      })
      process.exit(code)
    })
}
