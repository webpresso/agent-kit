import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { CAC } from 'cac'
import { z } from 'zod'

import { readJsonFileWithSchema } from '#shared-utils/read-json-file.js'
import { writeJsonFile } from '#shared-utils/write-json-file.js'

type OutputWriter = Pick<NodeJS.WriteStream, 'write'>

export type SecretManagerName = 'doppler' | 'infisical'

export interface SecretsConfig {
  readonly manager: SecretManagerName
  readonly projectId: string
  readonly projectLabel?: string
}

const SecretsConfigSchema = z.object({
  manager: z.enum(['doppler', 'infisical']),
  projectId: z.string(),
  projectLabel: z.string().optional(),
})

interface SecretManagerAvailability {
  readonly available: boolean
  readonly detail?: string
}

interface SecretManagerAuthentication {
  readonly authenticated: boolean
  readonly detail?: string
}

interface SecretManagerAdapter {
  readonly displayName: string
  checkAvailability(): Promise<SecretManagerAvailability>
  checkAuthentication(options: { workspace: string }): Promise<SecretManagerAuthentication>
}

interface SecretsRuntime {
  getSecretsConfigPath(cwd?: string): string
  readSecretsConfig(cwd?: string): SecretsConfig | null
  writeSecretsConfig(config: SecretsConfig, cwd?: string): void
  runSecretManagerSetup(options?: {
    cwd?: string
  }): Promise<{ manager: SecretManagerName; projectId: string }>
  secretManagerRegistry: Pick<Map<SecretManagerName, SecretManagerAdapter>, 'get'>
}

export interface ConfigCommandOptions {
  readonly cwd?: string
  readonly json?: boolean
  readonly label?: string
}

export interface SecretsConfigStatus {
  readonly configured: boolean
  readonly path: string
  readonly config: SecretsConfig | null
  readonly registered: boolean
  readonly available?: boolean
  readonly authenticated?: boolean
  readonly detail?: string
}

export interface SecretsConfigCommandDeps {
  readonly getPath?: (cwd?: string) => string
  readonly readConfig?: (cwd?: string) => SecretsConfig | null
  readonly writeConfig?: (config: SecretsConfig, cwd?: string) => void
  readonly setup?: (options?: {
    cwd?: string
  }) => Promise<{ manager: SecretManagerName; projectId: string }>
  readonly registry?: Pick<Map<SecretManagerName, SecretManagerAdapter>, 'get'>
  readonly stdout?: OutputWriter
  readonly stderr?: OutputWriter
}

function commandError(
  message: string,
  exitCode = 1,
  cause?: unknown,
): Error & { exitCode: number } {
  const error = new Error(message) as Error & { exitCode: number; cause?: unknown }
  error.exitCode = exitCode
  if (cause !== undefined) error.cause = cause
  return error
}

const secretManagerRegistry = new Map<SecretManagerName, SecretManagerAdapter>([
  ['doppler', createCliDiagnosticAdapter({ binary: 'doppler', displayName: 'Doppler' })],
  ['infisical', createCliDiagnosticAdapter({ binary: 'infisical', displayName: 'Infisical' })],
])

const localSecretsRuntime: SecretsRuntime = {
  getSecretsConfigPath,
  readSecretsConfig,
  writeSecretsConfig,
  runSecretManagerSetup: async () => {
    throw commandError(
      [
        'Interactive secret-manager setup is not bundled with agent-kit.',
        'Configure your manager CLI, then run: wp config secrets set <doppler|infisical> <project-id>',
      ].join(' '),
    )
  },
  secretManagerRegistry,
}

function createCliDiagnosticAdapter(options: {
  binary: SecretManagerName
  displayName: string
}): SecretManagerAdapter {
  return {
    displayName: options.displayName,
    async checkAvailability() {
      const result = spawnSync(options.binary, ['--version'], { stdio: 'ignore' })
      if (!result.error && result.status === 0) return { available: true }
      return {
        available: false,
        detail: `${options.displayName} CLI is not available on PATH.`,
      }
    },
    async checkAuthentication() {
      return {
        authenticated: false,
        detail: [
          `${options.displayName} CLI is installed, but agent-kit does not inspect manager auth state or fetch secrets.`,
          `Run the manager login flow, then verify execution with: wp secrets run --sink dev-server --profile preview -- <cmd>`,
        ].join(' '),
      }
    },
  }
}

function getSecretsConfigPath(cwd: string = process.cwd()): string {
  return join(findConfigRoot(cwd), 'webpresso', 'secrets.json')
}

function readSecretsConfig(cwd?: string): SecretsConfig | null {
  const path = getSecretsConfigPath(cwd)
  if (!existsSync(path)) return null
  let parsed: z.infer<typeof SecretsConfigSchema>
  try {
    parsed = readJsonFileWithSchema(path, SecretsConfigSchema)
  } catch (error) {
    throw commandError(`Invalid secret manager config at ${path}`, 1, error)
  }
  return {
    manager: parsed.manager,
    projectId: parsed.projectId,
    ...(typeof parsed.projectLabel === 'string' ? { projectLabel: parsed.projectLabel } : {}),
  }
}

function writeSecretsConfig(config: SecretsConfig, cwd?: string): void {
  const path = getSecretsConfigPath(cwd)
  mkdirSync(dirname(path), { recursive: true })
  writeJsonFile(path, config, { writeFileOptions: { mode: 0o600 } })
}

function findConfigRoot(cwd: string): string {
  const start = resolve(cwd)
  let current = start
  while (true) {
    const gitPath = join(current, '.git')
    if (existsSync(gitPath)) {
      const resolvedGitPath = resolveGitPath(gitPath, current)
      if (resolvedGitPath) return resolvedGitPath
    }
    const parent = dirname(current)
    if (parent === current) return join(start, '.webpresso')
    current = parent
  }
}

function resolveGitPath(gitPath: string, repositoryPath: string): string | undefined {
  try {
    const text = readFileSync(gitPath, 'utf8')
    const match = /^gitdir:\\s*(.+)$/u.exec(text.trim())
    if (!match) return undefined
    return resolve(repositoryPath, match[1]!)
  } catch {
    return gitPath
  }
}

function isSecretManagerName(value: string | undefined): value is SecretManagerName {
  return value === 'doppler' || value === 'infisical'
}

function writeJson(writer: OutputWriter, payload: unknown): void {
  writer.write(`${JSON.stringify(payload, null, 2)}\n`)
}

function writeLine(writer: OutputWriter, message: string): void {
  writer.write(`${message}\n`)
}

async function getStatus(
  cwd: string | undefined,
  deps: SecretsConfigCommandDeps,
): Promise<SecretsConfigStatus> {
  const runtime = localSecretsRuntime
  const path = (deps.getPath ?? runtime.getSecretsConfigPath)(cwd)
  const config = (deps.readConfig ?? runtime.readSecretsConfig)(cwd)
  if (!config) {
    return {
      configured: false,
      path,
      config: null,
      registered: false,
      detail: 'No secret manager configured.',
    }
  }

  const adapter = (deps.registry ?? runtime.secretManagerRegistry).get(config.manager) ?? null
  if (!adapter) {
    return {
      configured: true,
      path,
      config,
      registered: false,
      detail: `Secret manager "${config.manager}" is not registered.`,
    }
  }

  const availability = await adapter.checkAvailability()
  if (!availability.available) {
    return {
      configured: true,
      path,
      config,
      registered: true,
      available: false,
      authenticated: false,
      detail: availability.detail ?? `${adapter.displayName} CLI is not available.`,
    }
  }

  const auth = await adapter.checkAuthentication({ workspace: config.projectId })
  return {
    configured: true,
    path,
    config,
    registered: true,
    available: true,
    authenticated: auth.authenticated,
    detail: auth.detail,
  }
}

function formatShowMessage(status: SecretsConfigStatus): string {
  if (!status.configured || !status.config) {
    return `No secret profile configured.\nCommit a valid .webpresso/secrets.config.json and run: wp secrets doctor --profile preview --json`
  }
  return [
    `manager: ${status.config.manager}`,
    `projectId: ${status.config.projectId}`,
    ...(status.config.projectLabel ? [`projectLabel: ${status.config.projectLabel}`] : []),
    `path: ${status.path}`,
  ].join('\n')
}

function formatStatusMessage(status: SecretsConfigStatus): string {
  if (!status.configured || !status.config) {
    return `configured: no\npath: ${status.path}\naction: commit .webpresso/secrets.config.json and run 'wp secrets doctor --profile preview --json'`
  }

  return [
    `configured: yes`,
    `manager: ${status.config.manager}`,
    `projectId: ${status.config.projectId}`,
    `registered: ${status.registered ? 'yes' : 'no'}`,
    `available: ${status.available === true ? 'yes' : 'no'}`,
    `authenticated: ${status.authenticated === true ? 'yes' : 'no'}`,
    `path: ${status.path}`,
    ...(status.detail ? [`detail: ${status.detail}`] : []),
  ].join('\n')
}

export async function runSecretsConfigCommand(
  action: string | undefined,
  positional: readonly string[],
  options: ConfigCommandOptions = {},
  deps: SecretsConfigCommandDeps = {},
): Promise<number> {
  const stdout = deps.stdout ?? process.stdout
  const stderr = deps.stderr ?? process.stderr
  const cwd = options.cwd ?? process.cwd()

  switch (action) {
    case 'show': {
      const status = await getStatus(cwd, deps)
      if (options.json) writeJson(stdout, status)
      else writeLine(stdout, formatShowMessage(status))
      return status.configured ? 0 : 1
    }
    case 'status': {
      const status = await getStatus(cwd, deps)
      if (options.json) writeJson(stdout, status)
      else writeLine(stdout, formatStatusMessage(status))
      return status.configured && status.registered && status.available && status.authenticated
        ? 0
        : 1
    }
    case 'set': {
      const manager = positional[0]
      const projectId = positional[1]
      if (!isSecretManagerName(manager) || !projectId) {
        throw commandError('Usage: wp config secrets set <doppler|infisical> <project-id>')
      }

      const config: SecretsConfig = {
        manager,
        projectId,
        ...(options.label ? { projectLabel: options.label } : {}),
      }
      const runtime = localSecretsRuntime
      ;(deps.writeConfig ?? runtime.writeSecretsConfig)(config, cwd)
      const payload = {
        ok: true,
        path: (deps.getPath ?? runtime.getSecretsConfigPath)(cwd),
        config,
      }
      if (options.json) writeJson(stdout, payload)
      else writeLine(stdout, `Configured ${manager} project ${projectId}`)
      return 0
    }
    case 'setup': {
      const runtime = localSecretsRuntime
      const result = await (deps.setup ?? runtime.runSecretManagerSetup)({ cwd })
      const payload = {
        ok: true,
        path: (deps.getPath ?? runtime.getSecretsConfigPath)(cwd),
        config: { manager: result.manager, projectId: result.projectId },
      }
      if (options.json) writeJson(stdout, payload)
      else writeLine(stdout, `Configured ${result.manager} project ${result.projectId}`)
      return 0
    }
    default:
      stderr.write(
        [
          'Usage: wp config secrets <action> [options]',
          '',
          'Actions:',
          '  setup                           Interactive secret-manager setup',
          '  set <manager> <project-id>      Persist an explicit manager/project selection',
          '  show                            Show the current selection',
          '  status                          Check selection + local CLI auth state',
          '',
          'Options:',
          '  --json                          Print JSON',
          '  --label <label>                 Optional project label for `set`',
        ].join('\n') + '\n',
      )
      return 1
  }
}

export function registerConfigCommand(cli: CAC): void {
  cli
    .command('config <scope> [action] [...rest]', 'Repo configuration (supported: secrets)')
    .option('--json', 'Print JSON output')
    .option('--label <label>', 'Optional project label for `config secrets set`')
    .action(
      async (
        scope: string,
        action: string | undefined,
        rest: string[] | string | undefined,
        options: {
          json?: boolean
          label?: string
        },
      ) => {
        if (scope !== 'secrets') {
          throw commandError(`Unknown config scope: ${scope}. Use 'secrets'.`)
        }

        return runSecretsConfigCommand(action, typeof rest === 'string' ? [rest] : (rest ?? []), {
          json: options.json,
          label: options.label,
        })
      },
    )
}
