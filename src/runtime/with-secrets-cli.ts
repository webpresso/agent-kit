import process from 'node:process'

import { resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { isDirectRuntimeProfile, isRuntimeProfile } from './profiles.js'
import { spawnRuntimeCommandSync } from './executor.js'

interface ParsedCommand {
  readonly command: string
  readonly args: string[]
  readonly profile?: string
  readonly environment?: string
}

function usage(): string {
  return [
    'Usage: with-secrets [--env-profile <profile>] [--runtime-profile <profile>] [--secret-env-profile <profile>] -- <command> [args...]',
    '',
    'Runtime profiles: none, public, secrets-only, service-runtime, database, full',
    'Provider environment/config selectors use --secret-env-profile <profile>.',
  ].join('\n')
}

export function parseWithSecretsArgs(argv: readonly string[]): ParsedCommand | null {
  const args = [...argv]
  if (args.length === 0) return null

  let separatorIndex = args.indexOf('--')
  let profile: string | undefined
  let environment: string | undefined
  const preamble = separatorIndex === -1 ? args : args.slice(0, separatorIndex)
  const commandArgs = separatorIndex === -1 ? args : args.slice(separatorIndex + 1)

  for (let i = 0; i < preamble.length; i += 1) {
    const arg = preamble[i]
    if (!arg) continue

    if (arg === '--env-profile' || arg === '--runtime-profile') {
      profile = preamble[i + 1]
      i += 1
      continue
    }

    if (arg.startsWith('--env-profile=')) {
      profile = arg.slice('--env-profile='.length)
      continue
    }

    if (arg.startsWith('--runtime-profile=')) {
      profile = arg.slice('--runtime-profile='.length)
      continue
    }

    if (arg === '--secret-env-profile') {
      environment = preamble[i + 1]
      i += 1
      continue
    }

    if (arg.startsWith('--secret-env-profile=')) {
      environment = arg.slice('--secret-env-profile='.length)
      continue
    }

  }

  const [command, ...commandRest] = commandArgs
  if (!command) return null
  return { command, args: commandRest, profile, environment }
}

export function runWithSecretsCli(argv: readonly string[] = process.argv.slice(2)): number {
  const parsed = parseWithSecretsArgs(argv)
  if (!parsed) {
    console.error(usage())
    return 1
  }

  const selector = parsed.profile?.trim()
  if (selector && !isRuntimeProfile(selector) && !isDirectRuntimeProfile(selector)) {
    console.error(
      `Unknown runtime profile "${selector}". Use a runtime profile or pass provider selectors via --secret-env-profile.`,
    )
    return 1
  }

  const result = spawnRuntimeCommandSync({
    command: parsed.command,
    args: parsed.args,
    profile: selector,
    environment: parsed.environment,
    stdio: 'inherit',
  })

  if (result.error) {
    console.error(result.error.message)
    return 1
  }
  return result.status ?? 1
}

export function isDirectWithSecretsCliEntrypoint(
  argv: readonly string[] = process.argv,
  moduleUrl: string = import.meta.url,
): boolean {
  const invoked = argv[1]
  if (!invoked) return false
  return resolve(invoked) === fileURLToPath(moduleUrl)
}

if (isDirectWithSecretsCliEntrypoint()) {
  process.exit(runWithSecretsCli())
}
