import type { CAC } from 'cac'

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

export interface WpExtensionContext {
  readonly cwd: string
  readonly env: NodeJS.ProcessEnv
}

export interface WpExtensionCommandV1 {
  readonly name: string
  readonly description: string
  readonly register: (cli: CAC) => void
}

export interface WpExtensionAliasV1 {
  readonly name: string
  readonly commandName: string
}

export interface WpExtensionV1 {
  readonly apiVersion: '1'
  readonly name: string
  readonly version: string
  readonly hostRange: string
  readonly detect: (context: WpExtensionContext) => boolean | Promise<boolean>
  readonly commands: readonly WpExtensionCommandV1[]
  readonly aliases?: readonly WpExtensionAliasV1[]
}

export interface LoadedWpExtension {
  readonly packageName: string
  readonly specifier: string
  readonly extension?: WpExtensionV1
  readonly compatible: boolean
  readonly detected: boolean
  readonly warnings: readonly string[]
}

export interface WpExtensionAliasResolution {
  readonly aliases: ReadonlyMap<string, WpExtensionAliasV1>
  readonly warnings: readonly string[]
  readonly acceptedCommandNames: readonly string[]
}

export interface LoadWpExtensionsOptions {
  readonly cwd?: string
  readonly env?: NodeJS.ProcessEnv
  readonly hostVersion: string
  readonly importModule?: (specifier: string) => Promise<{ default?: unknown }>
  readonly resolveFrom?: (fromFile: string, specifier: string) => string
  readonly readJsonFile?: (path: string) => unknown
}

interface PackageJsonLike {
  readonly name?: string
  readonly dependencies?: Record<string, unknown>
  readonly devDependencies?: Record<string, unknown>
  readonly optionalDependencies?: Record<string, unknown>
  readonly webpresso?: {
    readonly wpExtension?: unknown
    readonly wpExtensions?: unknown
  }
}

export async function loadWpExtensions(
  options: LoadWpExtensionsOptions,
): Promise<readonly LoadedWpExtension[]> {
  const cwd = options.cwd ?? process.cwd()
  const env = options.env ?? process.env
  const readJsonFile = options.readJsonFile ?? defaultReadJsonFile
  const resolveFrom = options.resolveFrom ?? defaultResolveFrom
  const importModule = options.importModule ?? defaultImportModule

  const rootManifestPath = join(cwd, 'package.json')
  const rootManifest = readJsonFile(rootManifestPath) as PackageJsonLike | undefined
  const enabled = collectEnabledExtensionPackageNames(rootManifest)
  const loaded: LoadedWpExtension[] = []
  for (const warning of enabled.warnings) {
    loaded.push({
      packageName: rootManifest?.name ?? '<root>',
      specifier: 'webpresso.wpExtensions',
      compatible: false,
      detected: false,
      warnings: [warning],
    })
  }

  for (const packageName of enabled.packageNames) {
    const packageJsonPath = tryResolve(() =>
      resolveFrom(rootManifestPath, `${packageName}/package.json`),
    )
    if (!packageJsonPath) continue

    const dependencyManifest = readJsonFile(packageJsonPath) as PackageJsonLike | undefined
    const extensionSpecifier = dependencyManifest?.webpresso?.wpExtension
    if (typeof extensionSpecifier !== 'string' || extensionSpecifier.trim().length === 0) continue

    const normalizedSpecifier = extensionSpecifier.trim()
    const modulePath = tryResolve(() =>
      resolveFrom(
        packageJsonPath,
        normalizedSpecifier.startsWith('.') ? normalizedSpecifier : normalizedSpecifier,
      ),
    )
    if (!modulePath) {
      loaded.push({
        packageName,
        specifier: normalizedSpecifier,
        compatible: false,
        detected: false,
        warnings: [`${packageName}: could not resolve wp extension "${normalizedSpecifier}"`],
      })
      continue
    }

    let mod: { default?: unknown }
    try {
      mod = await importModule(modulePath)
    } catch (error) {
      loaded.push({
        packageName,
        specifier: normalizedSpecifier,
        compatible: false,
        detected: false,
        warnings: [`${packageName}: failed to load wp extension — ${formatError(error)}`],
      })
      continue
    }

    if (!isWpExtensionV1(mod.default)) {
      loaded.push({
        packageName,
        specifier: normalizedSpecifier,
        compatible: false,
        detected: false,
        warnings: [
          `${packageName}: wp extension module must default-export a WpExtensionV1 object`,
        ],
      })
      continue
    }

    const extension = mod.default
    const compatible = satisfiesHostRange(options.hostVersion, extension.hostRange)
    if (!compatible) {
      loaded.push({
        packageName,
        specifier: normalizedSpecifier,
        extension,
        compatible: false,
        detected: false,
        warnings: [
          `${packageName}: wp extension requires host ${extension.hostRange} but current host is ${options.hostVersion}`,
        ],
      })
      continue
    }

    let detected = false
    try {
      detected = await extension.detect({ cwd, env })
    } catch (error) {
      loaded.push({
        packageName,
        specifier: normalizedSpecifier,
        extension,
        compatible: true,
        detected: false,
        warnings: [`${packageName}: extension detect() threw: ${formatError(error)}`],
      })
      continue
    }

    loaded.push({
      packageName,
      specifier: normalizedSpecifier,
      extension,
      compatible: true,
      detected,
      warnings: [],
    })
  }

  return loaded
}

export function resolveAcceptedExtensionAliases(
  extensions: readonly LoadedWpExtension[],
  baseCommands: Iterable<string>,
  acceptedCommandNames: Iterable<string>,
): WpExtensionAliasResolution {
  const blocked = new Set(baseCommands)
  const knownCommands = new Set(acceptedCommandNames)
  for (const commandName of acceptedCommandNames) {
    blocked.add(commandName)
  }
  const aliases = new Map<string, WpExtensionAliasV1>()
  const warnings: string[] = []

  for (const extension of extensions) {
    if (!extension.extension || !extension.compatible || !extension.detected) continue

    for (const alias of extension.extension.aliases ?? []) {
      if (!knownCommands.has(alias.commandName)) {
        warnings.push(
          `${extension.packageName}: skipped alias "${alias.name}" because command "${alias.commandName}" is not registered`,
        )
        continue
      }
      if (blocked.has(alias.name)) {
        warnings.push(
          `${extension.packageName}: skipped alias "${alias.name}" because it collides with an existing wp command`,
        )
        continue
      }
      if (aliases.has(alias.name)) {
        warnings.push(
          `${extension.packageName}: skipped alias "${alias.name}" because another extension already claimed it`,
        )
        continue
      }
      aliases.set(alias.name, alias)
    }
  }

  return { aliases, warnings, acceptedCommandNames: [...acceptedCommandNames] }
}

export function isWpExtensionV1(value: unknown): value is WpExtensionV1 {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const candidate = value as WpExtensionV1
  if (candidate.apiVersion !== '1') return false
  if (typeof candidate.name !== 'string' || candidate.name.length === 0) return false
  if (typeof candidate.version !== 'string' || candidate.version.length === 0) return false
  if (typeof candidate.hostRange !== 'string' || candidate.hostRange.length === 0) return false
  if (typeof candidate.detect !== 'function') return false
  if (!Array.isArray(candidate.commands)) return false
  return candidate.commands.every(
    (command) =>
      command &&
      typeof command === 'object' &&
      typeof command.name === 'string' &&
      typeof command.description === 'string' &&
      typeof command.register === 'function',
  )
}

function collectEnabledExtensionPackageNames(manifest: PackageJsonLike | undefined): {
  readonly packageNames: readonly string[]
  readonly warnings: readonly string[]
} {
  if (!manifest) return { packageNames: [], warnings: [] }
  const enabled = manifest.webpresso?.wpExtensions
  if (enabled === undefined || enabled === false) return { packageNames: [], warnings: [] }

  const dependencyNames = collectDependencyNames(manifest)
  if (enabled === true) return { packageNames: dependencyNames, warnings: [] }

  if (!Array.isArray(enabled)) {
    return {
      packageNames: [],
      warnings: ['root package webpresso.wpExtensions must be true or an array of package names'],
    }
  }

  const dependencySet = new Set(dependencyNames)
  const packageNames: string[] = []
  const warnings: string[] = []
  for (const entry of enabled) {
    if (typeof entry !== 'string' || entry.trim().length === 0) {
      warnings.push('root package webpresso.wpExtensions contains a non-string package name')
      continue
    }
    const packageName = entry.trim()
    if (!dependencySet.has(packageName)) {
      warnings.push(
        `root package enables wp extension "${packageName}" but it is not a direct dependency`,
      )
      continue
    }
    packageNames.push(packageName)
  }
  return { packageNames: [...new Set(packageNames)], warnings }
}

function collectDependencyNames(manifest: PackageJsonLike): string[] {

  const packageNames = new Set<string>()
  for (const section of ['dependencies', 'devDependencies', 'optionalDependencies'] as const) {
    const dependencies = manifest[section]
    if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)) continue
    for (const packageName of Object.keys(dependencies)) packageNames.add(packageName)
  }
  return [...packageNames]
}

function defaultReadJsonFile(path: string): unknown {
  if (!existsSync(path)) return
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown
  } catch {
    return
  }
}

function defaultResolveFrom(fromFile: string, specifier: string): string {
  const localRequire = createRequire(fromFile)
  if (specifier.startsWith('.')) {
    return localRequire.resolve(join(dirname(fromFile), specifier))
  }
  return localRequire.resolve(specifier)
}

async function defaultImportModule(specifier: string): Promise<{ default?: unknown }> {
  return import(pathToFileURL(specifier).href)
}

function satisfiesHostRange(version: string, range: string): boolean {
  const normalizedRange = range.trim()
  if (normalizedRange.startsWith('^')) {
    const actual = parseVersion(version)
    const expected = parseVersion(normalizedRange.slice(1))
    if (!actual || !expected) return false
    const [actualMajor, actualMinor, actualPatch] = actual
    const [expectedMajor, expectedMinor, expectedPatch] = expected
    if (expectedMajor === 0) {
      return actualMajor === 0 && actualMinor === expectedMinor && actualPatch >= expectedPatch
    }
    if (actualMajor !== expectedMajor) return false
    if (actualMinor > expectedMinor) return true
    if (actualMinor < expectedMinor) return false
    return actualPatch >= expectedPatch
  }

  const actual = parseVersion(version)
  const expected = parseVersion(normalizedRange)
  if (!actual || !expected) return false
  return actual[0] === expected[0] && actual[1] === expected[1] && actual[2] === expected[2]
}

function parseVersion(value: string): readonly [number, number, number] | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)/u.exec(value.trim())
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

function tryResolve<T>(callback: () => T): T | undefined {
  try {
    return callback()
  } catch {
    return
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
