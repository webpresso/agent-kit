import type { CAC } from 'cac'
import type { SpawnSyncReturns } from 'node:child_process'

import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

import {
  isProjectOwnedTool,
  isUserOwnedTool,
  readToolingOwnershipState,
  tryReadRepoKey,
  type ToolingOwnershipState,
} from '#cli/tooling-ownership'
import {
  appendGlobalCapableVpArgs,
  type GlobalCapableVpCommandInput,
  resolveGlobalCapableVpCommand,
} from '#cli/global-vp.js'
import { resolveBundledVpCommand } from '#cli/auto-update/detect-pm.js'
import { resolveAgentKitPackageRoot } from '#cli/commands/init/package-root'
import { ensureClaudeCodeUserPlugin } from '#cli/commands/init/scaffolders/claude-plugin/index.js'
import { ensureCodexUserPlugin } from '#cli/commands/init/scaffolders/codex-plugin/index.js'
import { getManagedRunner } from '#tool-runtime'

export const PACKAGE_MANAGER_VERBS = ['install', 'add', 'remove', 'update', 'exec', 'run'] as const

export type PackageManagerVerb = (typeof PACKAGE_MANAGER_VERBS)[number]

export interface PackageManagerCommandConfig {
  readonly command: string
  readonly args: readonly string[]
}

export interface PackageManagerRunOptions {
  readonly cwd?: string
}

export interface PackageManagerCommandDeps {
  readonly argv?: readonly string[]
  readonly cwd?: string
  readonly exists?: typeof existsSync
  readonly gstackRoot?: string
  readonly mkdir?: typeof mkdirSync
  readonly ownershipState?: ToolingOwnershipState
  readonly repoKey?: string | null
  readonly run?: (
    command: string,
    args: readonly string[],
    options?: PackageManagerRunOptions,
  ) => SpawnSyncReturns<string>
  readonly resolveVpCommand?: () => GlobalCapableVpCommandInput | null
  readonly packageRoot?: string | null
  readonly refreshClaudePlugin?: (packageRoot: string) => SpawnSyncReturns<string>
  readonly refreshCodexPlugin?: (packageRoot: string) => SpawnSyncReturns<string>
}

const HELP_BY_VERB: Readonly<Record<PackageManagerVerb, string>> = {
  install: 'Install dependencies through the managed package/task facade.',
  add: 'Add dependencies through the managed package/task facade.',
  remove: 'Remove dependencies through the managed package/task facade.',
  update:
    'Refresh wp and any optional OMX/OMC/gstack integrations previously installed by wp; use --deps for local dependency updates through the managed package/task facade.',
  exec: 'Run a binary through the managed package/task facade.',
  run: 'Run a package script through the managed package/task facade.',
}

const GSTACK_REPO = 'https://github.com/garrytan/gstack.git'

interface PackageManagerCommandConfigWithId extends PackageManagerCommandConfig {
  readonly id: string
}

type GlobalUpdateStep =
  | PackageManagerCommandConfigWithId
  | {
      readonly id: string
      readonly run: (deps: RequiredGlobalUpdateDeps) => SpawnSyncReturns<string>
    }

interface RequiredGlobalUpdateDeps {
  readonly exists: typeof existsSync
  readonly gstackRoot: string
  readonly mkdir: typeof mkdirSync
  readonly ownershipState: ToolingOwnershipState
  readonly repoKey: string | null
  readonly vpCommand: GlobalCapableVpCommandInput
  readonly packageRoot: string | null
  readonly refreshClaudePlugin: (packageRoot: string) => SpawnSyncReturns<string>
  readonly refreshCodexPlugin: (packageRoot: string) => SpawnSyncReturns<string>
  readonly run: (
    command: string,
    args: readonly string[],
    options?: PackageManagerRunOptions,
  ) => SpawnSyncReturns<string>
}

export function registerPackageManagerCommand(cli: CAC, verb: PackageManagerVerb): void {
  const command = cli.command(`${verb} [...args]`, HELP_BY_VERB[verb])
  if (verb === 'update') {
    command.option('--deps', 'Update local dependencies through managed package/task update.')
    command.option('-g, --global', 'Compatibility alias for the default tooling refresh.')
  }

  command.allowUnknownOptions().action(() => runPackageManagerCommand(verb))
}

export function buildPackageManagerCommand(
  verb: PackageManagerVerb,
  argv: readonly string[] = process.argv,
): PackageManagerCommandConfig {
  const resolution = getManagedRunner('vp')
  const verbArgs = extractVerbArgs(verb, argv)
  return {
    command: resolution.command,
    args: [
      ...resolution.args,
      verb,
      ...(verb === 'update' ? stripWpUpdateControlFlags(verbArgs) : verbArgs),
    ],
  }
}

export function runPackageManagerCommand(
  verb: PackageManagerVerb,
  deps: PackageManagerCommandDeps = {},
): number {
  const argv = deps.argv ?? process.argv
  const cwd = deps.cwd ?? process.cwd()

  if (verb === 'update') {
    const mode = parseUpdateMode(extractVerbArgs(verb, argv))
    if (mode.kind === 'error') return failUsage(mode.message)
    if (mode.kind === 'tooling') return runGlobalUpdateCommand(deps)

    const packageRoot = resolveNearestPackageRoot(cwd, deps.exists ?? existsSync)
    if (packageRoot === null) {
      return failUsage(
        `wp update --deps: no package root found from ${cwd}; run inside a package or omit --deps to refresh tooling.`,
      )
    }

    const command = buildPackageManagerCommand(verb, argv)
    const result = (deps.run ?? defaultRun)(command.command, command.args, {
      cwd: packageRoot,
    })
    return typeof result.status === 'number' ? result.status : 1
  }

  const packageRoot = resolveNearestPackageRoot(cwd, deps.exists ?? existsSync)
  const command = buildPackageManagerCommand(verb, argv)
  const result = (deps.run ?? defaultRun)(command.command, command.args, {
    cwd: packageRoot ?? cwd,
  })
  return typeof result.status === 'number' ? result.status : 1
}

function runGlobalUpdateCommand(deps: PackageManagerCommandDeps): number {
  const cwd = deps.cwd ?? process.cwd()
  const vpCommand =
    deps.resolveVpCommand !== undefined
      ? deps.resolveVpCommand()
      : (resolveGlobalCapableVpCommand() ?? resolveBundledVpCommand())
  if (vpCommand === null) {
    return failUsage(
      'wp update: no bundled Vite+ runner found; reinstall @webpresso/agent-kit without omitting dependencies.',
    )
  }

  const globalDeps: RequiredGlobalUpdateDeps = {
    exists: deps.exists ?? existsSync,
    gstackRoot: deps.gstackRoot ?? defaultGstackRoot(),
    mkdir: deps.mkdir ?? mkdirSync,
    ownershipState: deps.ownershipState ?? readToolingOwnershipState(),
    packageRoot:
      deps.packageRoot === undefined
        ? resolveAgentKitPackageRoot({ moduleUrl: import.meta.url })
        : deps.packageRoot,
    repoKey: deps.repoKey ?? tryReadRepoKey(cwd),
    refreshClaudePlugin: deps.refreshClaudePlugin ?? refreshClaudeUserPlugin,
    refreshCodexPlugin: deps.refreshCodexPlugin ?? refreshCodexUserPlugin,
    vpCommand,
    run: deps.run ?? defaultRun,
  }
  const steps = buildGlobalUpdateSteps(globalDeps)
  let failed = false

  for (const step of steps) {
    try {
      const result = runGlobalUpdateStep(step, globalDeps)
      if (result.status !== 0) {
        failed = true
        console.error(formatGlobalUpdateFailure(step, result))
      }
    } catch (error) {
      failed = true
      console.error(formatGlobalUpdateThrownFailure(step, error))
    }
  }

  return failed ? 1 : 0
}

function buildGlobalUpdateSteps(
  deps: Pick<RequiredGlobalUpdateDeps, 'ownershipState' | 'repoKey' | 'vpCommand'>,
): readonly GlobalUpdateStep[] {
  const steps: GlobalUpdateStep[] = []

  if (
    isUserOwnedTool(deps.ownershipState, 'omx') ||
    isProjectOwnedTool(deps.ownershipState, 'omx', deps.repoKey)
  ) {
    const command = appendGlobalCapableVpArgs(deps.vpCommand, ['update', '-g', 'oh-my-codex'])
    steps.push({
      id: 'omx',
      command: command[0],
      args: command.slice(1),
    })
  }

  if (isUserOwnedTool(deps.ownershipState, 'omc')) {
    steps.push({
      id: 'omc',
      command: 'claude',
      args: ['plugin', 'update', '--scope', 'user', 'oh-my-claudecode'],
    })
  }

  if (isProjectOwnedTool(deps.ownershipState, 'omc', deps.repoKey)) {
    steps.push({
      id: 'omc-project',
      command: 'claude',
      args: ['plugin', 'update', '--scope', 'project', 'oh-my-claudecode'],
    })
  }

  if (isUserOwnedTool(deps.ownershipState, 'gstack')) {
    steps.push({
      id: 'gstack',
      run: refreshGstack,
    })
  }

  const command = appendGlobalCapableVpArgs(deps.vpCommand, [
    'install',
    '-g',
    '@webpresso/agent-kit',
  ])
  steps.push({
    id: 'wp',
    command: command[0],
    args: command.slice(1),
  })

  steps.push({
    id: 'claude-plugin',
    run: refreshClaudePlugin,
  })

  steps.push({
    id: 'codex-plugin',
    run: refreshCodexPlugin,
  })

  return steps
}

function runGlobalUpdateStep(
  step: GlobalUpdateStep,
  deps: RequiredGlobalUpdateDeps,
): SpawnSyncReturns<string> {
  if ('command' in step) return deps.run(step.command, step.args)
  return step.run(deps)
}

function refreshGstack(deps: RequiredGlobalUpdateDeps): SpawnSyncReturns<string> {
  const hasCheckout = deps.exists(path.join(deps.gstackRoot, '.git'))
  if (hasCheckout) {
    const pull = deps.run('git', ['-C', deps.gstackRoot, 'pull', '--ff-only', 'origin', 'main'])
    if (pull.status !== 0) return pull
  } else {
    deps.mkdir(path.dirname(deps.gstackRoot), { recursive: true })
    const clone = deps.run('git', ['clone', '--depth', '1', GSTACK_REPO, deps.gstackRoot])
    if (clone.status !== 0) return clone
  }

  return deps.run('./setup', ['--team'], { cwd: deps.gstackRoot })
}

function refreshCodexPlugin(deps: RequiredGlobalUpdateDeps): SpawnSyncReturns<string> {
  if (!deps.packageRoot) {
    return spawnLike(1, new Error('could not resolve @webpresso/agent-kit package root'))
  }
  return deps.refreshCodexPlugin(deps.packageRoot)
}

function refreshClaudePlugin(deps: RequiredGlobalUpdateDeps): SpawnSyncReturns<string> {
  if (!deps.packageRoot) {
    return spawnLike(1, new Error('could not resolve @webpresso/agent-kit package root'))
  }
  return deps.refreshClaudePlugin(deps.packageRoot)
}

function refreshClaudeUserPlugin(packageRoot: string): SpawnSyncReturns<string> {
  const result = ensureClaudeCodeUserPlugin({
    options: { dryRun: false, overwrite: false },
    packageRoot,
  })

  switch (result.kind) {
    case 'claude-plugin-installed':
    case 'claude-plugin-skipped-no-cli':
    case 'claude-plugin-skipped-opt-out':
    case 'claude-plugin-skipped-package-lifecycle':
      return spawnLike(0)
    case 'claude-plugin-skipped-dry-run':
    case 'claude-plugin-unavailable':
    case 'claude-plugin-failed':
      return spawnLike(1, new Error(result.kind))
  }
}

function refreshCodexUserPlugin(packageRoot: string): SpawnSyncReturns<string> {
  const result = ensureCodexUserPlugin({
    options: { dryRun: false, overwrite: false },
    packageRoot,
  })

  switch (result.kind) {
    case 'codex-plugin-installed':
    case 'codex-plugin-skipped-no-cli':
    case 'codex-plugin-skipped-opt-out':
    case 'codex-plugin-skipped-package-lifecycle':
      return spawnLike(0)
    case 'codex-plugin-skipped-dry-run':
    case 'codex-plugin-unavailable':
    case 'codex-plugin-timed-out':
    case 'codex-plugin-failed':
      return spawnLike(1, new Error(result.kind))
  }
}

function spawnLike(status: number, error?: Error): SpawnSyncReturns<string> {
  return {
    error,
    output: [],
    pid: 0,
    signal: null,
    status,
    stderr: '',
    stdout: '',
  }
}

function defaultGstackRoot(): string {
  return path.join(process.env.HOME || homedir(), '.claude', 'skills', 'gstack')
}

function resolveNearestPackageRoot(startCwd: string, exists: typeof existsSync): string | null {
  let current = path.resolve(startCwd)

  while (true) {
    if (exists(path.join(current, 'package.json'))) return current
    const parent = path.dirname(current)
    if (parent === current) return null
    current = parent
  }
}

function extractVerbArgs(verb: PackageManagerVerb, argv: readonly string[]): string[] {
  const verbIndex = argv.findIndex((arg, index) => index >= 2 && arg === verb)
  return verbIndex === -1 ? [] : argv.slice(verbIndex + 1)
}

type UpdateMode =
  | { readonly kind: 'tooling' }
  | { readonly kind: 'deps' }
  | { readonly kind: 'error'; readonly message: string }

function parseUpdateMode(args: readonly string[]): UpdateMode {
  const hasDeps = args.includes('--deps')
  const hasGlobal = hasGlobalFlag(args)
  const hasPositional = hasDependencyPositional(args)

  if (hasDeps && hasGlobal) {
    return {
      kind: 'error',
      message:
        'wp update: --deps cannot be combined with --global; choose dependency updates or tooling refresh.',
    }
  }

  if (hasGlobal && hasPositional) {
    return {
      kind: 'error',
      message:
        'wp update: package arguments imply --deps and cannot be combined with --global; use `wp update --deps ...` for dependency updates.',
    }
  }

  if (hasDeps || hasPositional) return { kind: 'deps' }

  const unknownFlags = args.filter((arg) => !isGlobalFlag(arg))
  if (unknownFlags.length > 0) {
    return {
      kind: 'error',
      message: `wp update: unrecognized tooling option(s): ${unknownFlags.join(
        ', ',
      )}. Bare \`wp update\` refreshes tooling; use \`wp update --deps ${unknownFlags.join(
        ' ',
      )}\` to pass dependency-update options.`,
    }
  }

  return { kind: 'tooling' }
}

function stripWpUpdateControlFlags(args: readonly string[]): string[] {
  return args.filter((arg) => arg !== '--deps' && !isGlobalFlag(arg))
}

function hasDependencyPositional(args: readonly string[]): boolean {
  let afterTerminator = false
  for (const arg of args) {
    if (afterTerminator) return true
    if (arg === '--') {
      afterTerminator = true
      continue
    }
    if (!arg.startsWith('-')) return true
  }
  return false
}

function hasGlobalFlag(args: readonly string[]): boolean {
  return args.some(isGlobalFlag)
}

function isGlobalFlag(arg: string): boolean {
  return arg === '--global' || arg === '-g'
}

function failUsage(message: string): number {
  console.error(message)
  return 1
}

function formatGlobalUpdateFailure(
  step: { readonly id: string },
  result: SpawnSyncReturns<string>,
): string {
  const error = result.error
  if (error) return `wp update: ${step.id} failed: ${error.message}`

  if (typeof result.status === 'number') {
    return `wp update: ${step.id} failed: exit ${result.status}`
  }

  if (result.signal) return `wp update: ${step.id} failed: signal ${result.signal}`

  return `wp update: ${step.id} failed: no exit status`
}

function formatGlobalUpdateThrownFailure(step: { readonly id: string }, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return `wp update: ${step.id} failed: ${message}`
}

function defaultRun(
  command: string,
  args: readonly string[],
  options: PackageManagerRunOptions = {},
): SpawnSyncReturns<string> {
  return spawnSync(command, [...args], {
    cwd: options.cwd,
    encoding: 'utf8',
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  })
}
