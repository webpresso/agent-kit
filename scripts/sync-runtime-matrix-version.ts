/**
 * Keeps the native runtime optionalDependencies in sync with
 * package.json#version. Run automatically as part of `changeset version`
 * (alongside sync-marketplace-version) so the @webpresso/agent-kit-runtime-*
 * optional deps never drift from the root version after a release bump.
 *
 * The package names are derived from bin/runtime-manifest.json#targets — the
 * same source `wp audit package-surface` checks — so this stays the single
 * source of truth and a new platform target is picked up automatically.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const packagePath = resolve(repoRoot, 'package.json')
const runtimeManifestPath = resolve(repoRoot, 'bin', 'runtime-manifest.json')

const packageManifest = JSON.parse(readFileSync(packagePath, 'utf8')) as {
  version: string
  optionalDependencies?: Record<string, string>
}
const runtimeManifest = JSON.parse(readFileSync(runtimeManifestPath, 'utf8')) as {
  targets?: { packageName?: string }[]
}

const { version } = packageManifest
const optionalDependencies = packageManifest.optionalDependencies ?? {}

let synced = 0
for (const target of runtimeManifest.targets ?? []) {
  if (!target.packageName) continue
  if (optionalDependencies[target.packageName] !== version) {
    optionalDependencies[target.packageName] = version
    synced += 1
  }
}

packageManifest.optionalDependencies = optionalDependencies
writeFileSync(packagePath, JSON.stringify(packageManifest, null, 2) + '\n')
console.log(`Runtime matrix optional deps synced to ${version} (${synced} updated)`)
