import { join } from 'node:path'

export interface BuildOxlintArgsOptions {
  readonly cwd: string
  readonly files?: readonly string[]
  readonly fix?: boolean
}

export function getOxlintConfigPath(cwd: string): string {
  return join(cwd, 'oxlint.config.ts')
}

export function buildOxlintArgs(options: BuildOxlintArgsOptions): string[] {
  const args: string[] = ['--config', getOxlintConfigPath(options.cwd), '--format=json']
  if (options.fix) args.push('--fix')
  if (options.files && options.files.length > 0) {
    args.push(...options.files)
  } else {
    args.push('.')
  }
  return args
}
