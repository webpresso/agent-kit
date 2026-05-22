import type { CAC } from 'cac'

import { runLint } from '#lint/index'

export const LINT_COMMAND_HELP = [
  'Lint via the `vp lint` facade.',
  '',
  'Examples:',
  '  ak lint',
  '  ak lint --fix',
].join('\n')

export function registerLintCommand(cli: CAC): void {
  cli
    .command('lint [...files]', LINT_COMMAND_HELP)
    .option('--fix', 'Apply autofixes via vp lint --fix')
    .action(async (files: string[] | undefined, flags: Record<string, unknown>) => {
      const result = await runLint({
        files: files && files.length > 0 ? files : undefined,
        fix: Boolean(flags.fix),
        cwd: process.cwd(),
      })

      if (result.spawnError) {
        console.error(result.spawnError)
        return result.exitCode || 1
      }

      if (result.parseError) {
        console.error(`lint output parse error: ${result.parseError}`)
      }

      if (result.issues.length > 0) {
        for (const issue of result.issues) {
          console.error(`${issue.file}:${issue.line}  [${issue.rule}]  ${issue.message}`)
        }
      }

      if (result.output) {
        process.stderr.write(result.output)
      }

      const verb = result.passed ? 'passed' : 'failed'
      const detail = result.issues.length > 0 ? ` (${result.issues.length} issue(s))` : ''
      console.error(`lint ${verb} via vp lint${detail}`)

      return result.exitCode
    })
}
