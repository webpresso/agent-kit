import type { CAC } from 'cac'
import type { SpawnSyncReturns } from 'node:child_process'

import { spawnSync } from 'node:child_process'

import { createWpErrorEnvelope } from '#errors/wp-error.js'
import { genericTransform } from '#output-transforms/generic'

export const ERR_COMMAND_HELP = [
  'Run a command and print only failure-looking output lines.',
  '',
  'Examples:',
  '  wp err sh -c \'echo a; echo "ERROR: x"; echo b\'',
  '  wp err pnpm test',
].join('\n')

export interface ErrCommandDeps {
  readonly run?: (command: string, args: readonly string[]) => SpawnSyncReturns<string>
  readonly stdout?: Pick<NodeJS.WriteStream, 'write'>
  readonly stderr?: Pick<NodeJS.WriteStream, 'write'>
}

interface ErrEnvelopeFlags {
  readonly json: boolean
  readonly code?: string
  readonly problem?: string
  readonly cause?: string
  readonly fix?: string
  readonly docsUrl?: string
  readonly redact: readonly string[]
}

interface ParsedErrCommand {
  readonly command: string
  readonly args: readonly string[]
  readonly envelope: ErrEnvelopeFlags
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
    write(deps.stderr ?? process.stderr, 'Usage: wp err <cmd> [...args]\n')
    return 1
  }

  const parsed = parseErrCommand(commandParts)
  if (!parsed) {
    write(deps.stderr ?? process.stderr, 'Usage: wp err <cmd> [...args]\n')
    return 1
  }
  const result = (deps.run ?? defaultRun)(parsed.command, parsed.args)
  const rawOutput = combineOutput(result.stdout, result.stderr)
  const exitCode = typeof result.status === 'number' ? result.status : result.error ? 1 : 0

  if (
    exitCode !== 0 &&
    (parsed.envelope.json
      || parsed.envelope.code
      || parsed.envelope.problem
      || parsed.envelope.cause
      || parsed.envelope.fix
      || parsed.envelope.docsUrl)
  ) {
    const envelope = createWpErrorEnvelope({
      code: parsed.envelope.code ?? 'WP_ERR_COMMAND_FAILED',
      problem: parsed.envelope.problem ?? 'Command failed.',
      cause:
        parsed.envelope.cause
        ?? `The command exited with status ${exitCode}.`,
      fix:
        parsed.envelope.fix
        ?? 'Inspect the redacted evidence and rerun the command once the failure is fixed.',
      docsUrl:
        parsed.envelope.docsUrl
        ?? 'docs/errors/wp-secret-orchestration.md#wp_err_command_failed',
      evidence: {
        command: [parsed.command, ...parsed.args].join(' '),
        output: combineOutput(result.stderr, result.stdout) || result.error?.message || '',
      },
      redact: parsed.envelope.redact,
    })
    const rendered = parsed.envelope.json
      ? JSON.stringify(envelope)
      : formatEnvelopeText(envelope)
    write(deps.stdout ?? process.stdout, ensureTrailingNewline(rendered))
    return exitCode
  }

  const compact = genericTransform(rawOutput || result.error?.message, {
    toolName: 'wp_err',
    normalizedToolName: 'err',
    persistOverflow: false,
  })

  if (compact.rawOutput) {
    write(deps.stdout ?? process.stdout, ensureTrailingNewline(compact.rawOutput))
  }

  return exitCode
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

function formatEnvelopeText(envelope: ReturnType<typeof createWpErrorEnvelope>): string {
  return [
    `${envelope.code}: ${envelope.problem}`,
    `Cause: ${envelope.cause}`,
    `Fix: ${envelope.fix}`,
    `Docs: ${envelope.docsUrl}`,
    `Evidence: ${JSON.stringify(envelope.evidence)}`,
  ].join('\n')
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

function parseErrCommand(commandParts: readonly string[]): ParsedErrCommand | null {
  const args = [...commandParts]
  let index = 0
  let json = false
  let code: string | undefined
  let problem: string | undefined
  let cause: string | undefined
  let fix: string | undefined
  let docsUrl: string | undefined
  const redact: string[] = []

  const readValue = (flag: string): string => {
    const value = args[index + 1]
    if (!value) {
      throw new Error(`Missing value for ${flag}`)
    }
    index += 2
    return value
  }

  while (index < args.length) {
    const arg = args[index]
    if (arg === '--') {
      index += 1
      break
    }
    if (!arg?.startsWith('--')) {
      break
    }
    switch (arg) {
      case '--json':
        json = true
        index += 1
        continue
      case '--code':
        code = readValue(arg)
        continue
      case '--problem':
        problem = readValue(arg)
        continue
      case '--cause':
        cause = readValue(arg)
        continue
      case '--fix':
        fix = readValue(arg)
        continue
      case '--docs-url':
        docsUrl = readValue(arg)
        continue
      case '--redact':
        redact.push(readValue(arg))
        continue
      default:
        break
    }
    break
  }

  const command = args[index]
  if (!command) return null
  return {
    command,
    args: args.slice(index + 1),
    envelope: { json, code, problem, cause, fix, docsUrl, redact },
  }
}

function write(stream: Pick<NodeJS.WriteStream, 'write'>, message: string): void {
  stream.write(message)
}
