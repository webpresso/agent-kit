/**
 * Keeps .claude-plugin/marketplace.json#metadata.version and #version in sync
 * with package.json#version. Run automatically as part of `changeset version`
 * so the marketplace manifest never drifts after a release bump.
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const marketplacePath = resolve(repoRoot, '.claude-plugin', 'marketplace.json')

const { version } = JSON.parse(readFileSync(resolve(repoRoot, 'package.json'), 'utf8')) as {
  version: string
}

const manifest = JSON.parse(readFileSync(marketplacePath, 'utf8')) as Record<string, unknown> & {
  metadata?: { version?: string }
  version?: string
}

manifest.version = version
if (manifest.metadata && typeof manifest.metadata === 'object') {
  manifest.metadata.version = version
}

writeFileSync(marketplacePath, JSON.stringify(manifest, null, 2) + '\n')
console.log(`marketplace.json synced to ${version}`)
