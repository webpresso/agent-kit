#!/usr/bin/env bun

import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'

import {
  RUNTIME_BINARY_NAME,
  RUNTIME_TARGETS,
  runtimeBinaryFilename,
  runtimePackageDirName,
  type RuntimeTarget,
} from '#build/runtime-targets.js'
import { syncBlueprintMigrationSqlAssets } from '#build/blueprint-migration-assets.js'

export interface RuntimeStageOperation {
  readonly target: RuntimeTarget
  readonly source: string
  readonly pluginDestination: string
  readonly packageBinaryDestination: string
  readonly packageManifestDestination: string
}

interface StageOptions {
  readonly rootDir?: string
  readonly packageVersion?: string
}

function readPackageVersion(rootDir: string): string {
  const manifest = JSON.parse(readFileSync(resolve(rootDir, 'package.json'), 'utf8')) as {
    version?: string
  }
  if (!manifest.version) throw new Error('package.json is missing version')
  return manifest.version
}

export function buildRuntimeStageOperations(
  options: StageOptions = {},
): readonly RuntimeStageOperation[] {
  const rootDir = options.rootDir ?? process.cwd()
  return RUNTIME_TARGETS.map((target) => {
    const filename = runtimeBinaryFilename(target)
    const packageDir = runtimePackageDirName(target.packageName)
    return {
      target,
      source: resolve(rootDir, 'dist', 'runtime', target.id, filename),
      pluginDestination: resolve(rootDir, 'bin', 'runtime', target.id, filename),
      packageBinaryDestination: resolve(
        rootDir,
        'dist',
        'runtime-packages',
        packageDir,
        'bin',
        filename,
      ),
      packageManifestDestination: resolve(
        rootDir,
        'dist',
        'runtime-packages',
        packageDir,
        'package.json',
      ),
    }
  })
}

export function renderRuntimePackageManifest(target: RuntimeTarget, version: string): string {
  return `${JSON.stringify(
    {
      name: target.packageName,
      version,
      description: `Compiled ${target.id} runtime for @webpresso/agent-kit`,
      license: 'MIT',
      type: 'module',
      repository: {
        type: 'git',
        url: 'https://github.com/webpresso/agent-kit',
      },
      os: [target.os],
      cpu: [target.cpu],
      publishConfig: {
        registry: 'https://registry.npmjs.org/',
        access: 'public',
      },
      bin: {
        [RUNTIME_BINARY_NAME]: `bin/${runtimeBinaryFilename(target)}`,
      },
      files: ['bin'],
    },
    null,
    2,
  )}\n`
}

export function stageRuntimeArtifacts({
  rootDir = process.cwd(),
  dryRun = false,
  allowMissing = false,
}: {
  readonly rootDir?: string
  readonly dryRun?: boolean
  readonly allowMissing?: boolean
} = {}): readonly string[] {
  const packageVersion = readPackageVersion(rootDir)
  const staged: string[] = []

  for (const operation of buildRuntimeStageOperations({ rootDir, packageVersion })) {
    if (!existsSync(operation.source)) {
      const message = `missing compiled runtime artifact for ${operation.target.id}: ${operation.source}`
      if (allowMissing) {
        staged.push(message)
        continue
      }
      throw new Error(message)
    }

    if (dryRun) {
      staged.push(`${operation.source} -> ${operation.pluginDestination}`)
      staged.push(`${operation.source} -> ${operation.packageBinaryDestination}`)
      continue
    }

    mkdirSync(dirname(operation.pluginDestination), { recursive: true })
    mkdirSync(dirname(operation.packageBinaryDestination), { recursive: true })
    copyFileSync(operation.source, operation.pluginDestination)
    copyFileSync(operation.source, operation.packageBinaryDestination)
    chmodSync(operation.pluginDestination, 0o755)
    chmodSync(operation.packageBinaryDestination, 0o755)
    writeFileSync(
      operation.packageManifestDestination,
      renderRuntimePackageManifest(operation.target, packageVersion),
      'utf8',
    )
    staged.push(operation.pluginDestination)
    staged.push(operation.packageBinaryDestination)
    staged.push(operation.packageManifestDestination)
  }

  if (!dryRun) {
    syncBlueprintMigrationSqlAssets(rootDir)
    staged.push(resolve(rootDir, 'dist', 'esm', 'blueprint', 'db', 'migrations'))
  }

  return staged
}

function parseFlag(name: string): boolean {
  return process.argv.includes(name)
}

if (import.meta.main) {
  const dryRun = parseFlag('--dry-run')
  const allowMissing = parseFlag('--allow-missing')
  for (const line of stageRuntimeArtifacts({ dryRun, allowMissing })) console.log(line)
}
