import type { CAC } from 'cac'
import type { SpawnSyncReturns } from 'node:child_process'

import { spawnSync } from 'node:child_process'

import { getManagedRunner } from '#tool-runtime'

export const PACKAGE_MANAGER_VERBS = ['install', 'add', 'remove', 'update', 'exec', 'run'] as const

export type PackageManagerVerb = (typeof PACKAGE_MANAGER_VERBS)[number]

export interface PackageManagerCommandConfig {
  readonly command: string
  readonly args: readonly string[]
}

export interface PackageManagerCommandDeps {
  readonly run?: (command: string, args: readonly string[]) => SpawnSyncReturns<string>
}

const HELP_BY_VERB: Readonly<Record<PackageManagerVerb, string>> = {
  install: 'Install dependencies through the managed vp facade.',
  add: 'Add dependencies through the managed vp facade.',
  remove: 'Remove dependencies through the managed vp facade.',
  update: 'Update dependencies through the managed vp facade.',
  exec: 'Run a binary through the managed vp facade.',
  run: 'Run a package script through the managed vp facade.',
}

export function registerPackageManagerCommand(cli: CAC, verb: PackageManagerVerb): void {
  cli
    .command(`${verb} [...args]`, HELP_BY_VERB[verb])
    .allowUnknownOptions()
    .action(() => runPackageManagerCommand(verb))
}

export function buildPackageManagerCommand(
  verb: PackageManagerVerb,
  argv: readonly string[] = process.argv,
): PackageManagerCommandConfig {
  const resolution = getManagedRunner('vp')
  return {
    command: resolution.command,
    args: [...resolution.args, verb, ...extractVerbArgs(verb, argv)],
  }
}

export function runPackageManagerCommand(
  verb: PackageManagerVerb,
  deps: PackageManagerCommandDeps = {},
): number {
  const command = buildPackageManagerCommand(verb)
  const result = (deps.run ?? defaultRun)(command.command, command.args)
  return typeof result.status === 'number' ? result.status : 1
}

function extractVerbArgs(verb: PackageManagerVerb, argv: readonly string[]): string[] {
  const verbIndex = argv.findIndex((arg, index) => index >= 2 && arg === verb)
  return verbIndex === -1 ? [] : argv.slice(verbIndex + 1)
}

function defaultRun(command: string, args: readonly string[]): SpawnSyncReturns<string> {
  return spawnSync(command, [...args], {
    encoding: 'utf8',
    env: process.env,
    stdio: 'inherit',
    windowsHide: true,
  })
}
