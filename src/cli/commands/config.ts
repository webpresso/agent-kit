import type { CAC } from 'cac'

type OutputWriter = Pick<NodeJS.WriteStream, 'write'>

export type SecretManagerName = 'doppler' | 'infisical'

export interface SecretsConfig {
  readonly manager: SecretManagerName
  readonly projectId: string
  readonly projectLabel?: string
}

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

let runtimeCache: Promise<SecretsRuntime> | undefined

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

async function loadSecretsRuntime(): Promise<SecretsRuntime> {
  if (!runtimeCache) {
    runtimeCache = (
      Function('specifier', 'return import(specifier)') as (specifier: string) => Promise<unknown>
    )('@webpresso/webpresso/runtime/env').then((mod) => mod as SecretsRuntime)
  }
  return runtimeCache
}

function commandError(message: string, exitCode = 1): Error & { exitCode: number } {
  const error = new Error(message) as Error & { exitCode: number }
  error.exitCode = exitCode
  return error
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
  const runtime = deps.getPath && deps.readConfig ? undefined : await loadSecretsRuntime()
  const path = (deps.getPath ?? runtime?.getSecretsConfigPath ?? (() => ''))(cwd)
  const config = (deps.readConfig ?? runtime?.readSecretsConfig ?? (() => null))(cwd)
  if (!config) {
    return {
      configured: false,
      path,
      config: null,
      registered: false,
      detail: 'No secret manager configured.',
    }
  }

  const adapter = (deps.registry ?? runtime?.secretManagerRegistry)?.get(config.manager) ?? null
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
    return `No secret manager configured.\nRun: wp config secrets setup`
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
    return `configured: no\npath: ${status.path}\naction: run 'wp config secrets setup'`
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
      const runtime = deps.writeConfig && deps.getPath ? undefined : await loadSecretsRuntime()
      ;(deps.writeConfig ?? runtime?.writeSecretsConfig ?? (() => undefined))(config, cwd)
      const payload = {
        ok: true,
        path: (deps.getPath ?? runtime?.getSecretsConfigPath ?? (() => ''))(cwd),
        config,
      }
      if (options.json) writeJson(stdout, payload)
      else writeLine(stdout, `Configured ${manager} project ${projectId}`)
      return 0
    }
    case 'setup': {
      const runtime = deps.setup && deps.getPath ? undefined : await loadSecretsRuntime()
      const result = await (
        deps.setup ??
        runtime?.runSecretManagerSetup ??
        (() => Promise.reject(commandError('Secret-manager runtime unavailable')))
      )({ cwd })
      const payload = {
        ok: true,
        path: (deps.getPath ?? runtime?.getSecretsConfigPath ?? (() => ''))(cwd),
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
