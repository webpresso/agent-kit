/**
 * Install-topology detection for the auto-update installer.
 *
 * Agent Kit is distributed as a published package. Auto-update supports the
 * historical Vite+ global lane and the npm global lane used by public install
 * docs. Local dev/source execution is explicit via `WP_FORCE_SOURCE=1` and is
 * not an install topology.
 */

import { realpathSync } from 'node:fs'
import { delimiter, sep } from 'node:path'

import { getLegacyAgentCommandReplacement } from '#cli/bundle/agent-command-inventory.js'
import {
  appendGlobalCapableVpArgs,
  type GlobalCapableVpCommandInput,
  resolveGlobalCapableVpCommand,
} from '#cli/global-vp.js'
import { getManagedRunner } from '#tool-runtime'

export type InstallTopology = 'vp' | 'npm'

export interface DetectSuccess {
  topology: InstallTopology
  command: string[]
}

export interface DetectAbort {
  abort: string
}

export type DetectResult = DetectSuccess | DetectAbort

export const PUBLIC_PACKAGE_NAME = '@webpresso/agent-kit'
export const PUBLIC_NPM_REGISTRY = 'https://registry.npmjs.org'

/**
 * Canonical global-install command for the public agent-kit.
 *
 * Vite+ remains the historical global install surface. `wp` now bundles the
 * Vite+ runner, so this command can be built from either a global `vp` or the
 * managed package dependency.
 */
export function buildVpGlobalInstallCommand(
  vpCommand: GlobalCapableVpCommandInput = 'vp',
): [string, ...string[]] {
  return appendGlobalCapableVpArgs(vpCommand, ['install', '-g', PUBLIC_PACKAGE_NAME])
}

export function buildNpmGlobalInstallCommand(npmCommand = 'npm'): [string, ...string[]] {
  return [npmCommand, 'install', '-g', PUBLIC_PACKAGE_NAME]
}

function commandForTopology(
  topology: InstallTopology,
  resolveVpCommand: () => GlobalCapableVpCommandInput | null,
  resolveNpmCommand: () => string,
): string[] | null {
  if (topology === 'npm') return buildNpmGlobalInstallCommand(resolveNpmCommand())
  const vpCommand = resolveVpCommand()
  return vpCommand === null ? null : buildVpGlobalInstallCommand(vpCommand)
}

export function formatLegacyCommandReplacementMessage(legacyCommand: string): string | null {
  const replacement = getLegacyAgentCommandReplacement(legacyCommand)
  if (replacement === null) return null
  return `Legacy agent-kit command \`${legacyCommand}\` has a future replacement: \`${replacement}\`.`
}

/**
 * Detect the install topology that owns the running `wp` / agent-kit binary.
 */
export function detect(
  env: NodeJS.ProcessEnv,
  argv0: string,
  resolveVpCommand: () => GlobalCapableVpCommandInput | null = () =>
    resolveGlobalCapableVpCommand(env.PATH ?? '') ?? resolveBundledVpCommand(),
  resolveNpmCommand: () => string = () => 'npm',
): DetectResult {
  if (env.WP_FORCE_SOURCE === '1') {
    return {
      abort:
        'WP_FORCE_SOURCE=1 is enabled; source-mode development is explicit and auto-install is disabled.',
    }
  }

  const realpath = safeRealpath(argv0)
  if (realpath === null) {
    return { abort: unableToDetectMessage(argv0) }
  }

  if (isProjectLocalNodeModulesBin(realpath) || isProjectLocalNodeModulesBin(argv0)) {
    return {
      abort: `${PUBLIC_PACKAGE_NAME} is running from a project-local node_modules tree (${realpath}); install the published package with \`npm install -g ${PUBLIC_PACKAGE_NAME}\` and run global \`wp\`.`,
    }
  }

  const fromPath = matchStoreMarker(realpath)
  const fromUa = parseUserAgent(env.npm_config_user_agent ?? '')

  if (fromPath === 'vp' || fromUa === 'vp') {
    const command = commandForTopology('vp', resolveVpCommand, resolveNpmCommand)
    if (command === null) return { abort: globalVpUnavailableMessage() }
    return { topology: 'vp', command }
  }

  if (fromPath === 'npm' || fromUa === 'npm') {
    return {
      topology: 'npm',
      command: commandForTopology('npm', resolveVpCommand, resolveNpmCommand) ?? [],
    }
  }

  const shim = detectShim(realpath)
  if (shim !== null) return { abort: shim }

  return { abort: unableToDetectMessage(realpath) }
}

/**
 * Parse the `npm_config_user_agent` string for supported global install
 * topologies. Other package managers may execute project installs, but they do
 * not own Agent Kit's global consumer install.
 */
export function parseUserAgent(userAgent: string): InstallTopology | null {
  const trimmed = userAgent.trim()
  if (trimmed.length === 0) return null
  const head = trimmed.split(/\s+/, 1)[0]
  if (head === undefined) return null
  const slash = head.indexOf('/')
  const name = (slash === -1 ? head : head.slice(0, slash)).toLowerCase()
  if (name === 'vp') return 'vp'
  if (name === 'npm') return 'npm'
  return null
}

/**
 * Look for supported global install store markers.
 */
export function matchStoreMarker(realpath: string): InstallTopology | null {
  const segments = splitPathSegments(realpath)
  if (segments.includes('.vite-plus')) return 'vp'
  if (isGlobalNodeModules(realpath)) return 'npm'
  return null
}

/**
 * Detect unsupported shim/global-manager layouts and provide the supported fix.
 */
export function detectShim(realpath: string): string | null {
  const segments = splitPathSegments(realpath)
  if (segments.includes('.volta')) return unsupportedManagerMessage('Volta', realpath)
  if (segments.includes('.asdf')) return unsupportedManagerMessage('asdf', realpath)
  if (segments.includes('Cellar') || segments.includes('Homebrew')) {
    return unsupportedManagerMessage('Homebrew', realpath)
  }
  if (segments.some((seg) => seg === '.pnpm' || seg === '.pnpm-store' || seg === 'pnpm-global')) {
    return unsupportedManagerMessage('pnpm global', realpath)
  }
  if (segments.includes('.bun') && (segments.includes('install') || segments.includes('global'))) {
    return unsupportedManagerMessage('bun global', realpath)
  }
  if (segments.includes('.yarn') && (segments.includes('global') || segments.includes('berry'))) {
    return unsupportedManagerMessage('yarn global', realpath)
  }
  return null
}

/**
 * Supported consumer global topologies.
 * Exported for testability and for legacy callers that still ask the question.
 */
export function confirmInstalledGlobally(realpath: string, _env: NodeJS.ProcessEnv): boolean {
  return matchStoreMarker(realpath) !== null
}

function unsupportedManagerMessage(manager: string, realpath: string): string {
  return `${PUBLIC_PACKAGE_NAME} appears to be managed by ${manager} (${realpath}); reinstall with \`npm install -g ${PUBLIC_PACKAGE_NAME}\`. Source development uses WP_FORCE_SOURCE=1 from an agent-kit checkout.`
}

function globalVpUnavailableMessage(): string {
  return `Unable to resolve the bundled Vite+ runner for ${PUBLIC_PACKAGE_NAME}; auto-install disabled. Reinstall ${PUBLIC_PACKAGE_NAME} without omitting dependencies, then re-run.`
}

function unableToDetectMessage(pathHint: string): string {
  return `Unable to verify a supported global install for ${PUBLIC_PACKAGE_NAME} at ${pathHint}; auto-install disabled. Install with \`npm install -g ${PUBLIC_PACKAGE_NAME}\` or use WP_FORCE_SOURCE=1 inside the agent-kit source repo.`
}

export function resolveBundledVpCommand(): GlobalCapableVpCommandInput | null {
  const resolution = getManagedRunner('vp', { outputPolicy: 'structured' })
  if (resolution.source !== 'managed') return null
  if (resolution.args.length === 0) return resolution.command
  return {
    command: resolution.command,
    argsPrefix: resolution.args,
    executable: resolution.args[0] ?? resolution.command,
  }
}

function isProjectLocalNodeModulesBin(p: string): boolean {
  const segments = splitPathSegments(p)
  return (
    segments.includes('node_modules') && !segments.includes('.vite-plus') && !isGlobalNodeModules(p)
  )
}

function isGlobalNodeModules(p: string): boolean {
  return (
    p.includes(`${sep}usr${sep}local${sep}lib${sep}node_modules${sep}`) ||
    p.includes(`${sep}opt${sep}homebrew${sep}lib${sep}node_modules${sep}`) ||
    p.includes(`${sep}lib${sep}node_modules${sep}`)
  )
}

function safeRealpath(p: string): string | null {
  try {
    return realpathSync(p)
  } catch {
    return null
  }
}

function splitPathSegments(p: string): string[] {
  const normalized = p.replace(/\\/g, sep)
  const stripped = normalized.startsWith(sep) ? normalized.slice(sep.length) : normalized
  return stripped.split(sep).filter((s) => s.length > 0 && s !== delimiter)
}
