import type { CAC } from 'cac'
import type { SpawnSyncReturns } from 'node:child_process'

import { spawnSync } from 'node:child_process'

import { genericTransform } from '#output-transforms/generic'

export const ERR_COMMAND_HELP = [
  'Run a command and print only failure-looking output lines.',
  '',
  'Examples:',
  '  ak err sh -c \'echo a; echo "ERROR: x"; echo b\'',
  '  ak err pnpm test',
].join('\n')

export interface ErrCommandDeps {
  readonly run?: (command: string, args: readonly string[]) => SpawnSyncReturns<string>
  readonly stdout?: Pick<NodeJS.WriteStream, 'write'>
  readonly stderr?: Pick<NodeJS.WriteStream, 'write'>
}

export function registerErrCommand(cli: CAC): void {
  cli
    .command('err [...cmd]', ERR_COMMAND_HELP)
    .allowUnknownOptions()
    .action((cmd: string[] | string | undefined) => {
      return runErrCommand(getRawErrCommandParts() ?? toArray(cmd))
    })
}

export function runErrCommand(commandParts: readonly string[], deps: ErrCommandDeps = {}): number {
  if (commandParts.length === 0) {
    write(deps.stderr ?? process.stderr, 'Usage: ak err <cmd> [...args]\n')
    return 1
  }

  const command = commandParts[0]
  const args = commandParts.slice(1)
  if (!command) {
    write(deps.stderr ?? process.stderr, 'Usage: ak err <cmd> [...args]\n')
    return 1
  }
  const result = (deps.run ?? defaultRun)(command, args)
  const rawOutput = combineOutput(result.stdout, result.stderr)
  const compact = genericTransform(rawOutput || result.error?.message, {
    toolName: 'ak_err',
    normalizedToolName: 'err',
    persistOverflow: false,
  })

  if (compact.rawOutput) {
    write(deps.stdout ?? process.stdout, ensureTrailingNewline(compact.rawOutput))
  }

  return typeof result.status === 'number' ? result.status : result.error ? 1 : 0
}

function defaultRun(command: string, args: readonly string[]): SpawnSyncReturns<string> {
  return spawnSync(command, [...args], {
    encoding: 'utf8',
    env: process.env,
    windowsHide: true,
  })
}

function combineOutput(
  stdout: string | null | undefined,
  stderr: string | null | undefined,
): string {
  const parts = [stdout ?? '', stderr ?? ''].filter((part) => part.length > 0)
  if (parts.length === 0) return ''
  if (parts.length === 1) return parts[0] ?? ''
  return parts[0]?.endsWith('\n') ? parts.join('') : parts.join('\n')
}

function ensureTrailingNewline(output: string): string {
  return output.endsWith('\n') ? output : `${output}\n`
}

function toArray(value: readonly string[] | string | undefined): string[] {
  if (value === undefined) return []
  return typeof value === 'string' ? [value] : [...value]
}

function getRawErrCommandParts(): string[] | undefined {
  const errIndex = process.argv.indexOf('err')
  if (errIndex < 0) return undefined
  return process.argv.slice(errIndex + 1)
}

function write(stream: Pick<NodeJS.WriteStream, 'write'>, message: string): void {
  stream.write(message)
}
