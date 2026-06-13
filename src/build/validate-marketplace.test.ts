import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const __dirname = dirname(fileURLToPath(import.meta.url))
const repoRoot = resolve(__dirname, '..', '..')

interface MarketplaceManifest {
  name: string
  owner: { name: string; url?: string }
  metadata: { description: string; version: string }
  plugins: Array<{
    name: string
    source: string
    description?: string
    category?: string
    keywords?: string[]
  }>
}

interface PackageJson {
  version: string
}

interface PluginManifest {
  description?: string
}

function readJson<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

describe('marketplace.json', () => {
  const marketplace = readJson<MarketplaceManifest>(
    resolve(repoRoot, '.claude-plugin', 'marketplace.json'),
  )
  const packageJson = readJson<PackageJson>(resolve(repoRoot, 'package.json'))
  const pluginManifest = readJson<PluginManifest>(
    resolve(repoRoot, '.claude-plugin', 'plugin.json'),
  )

  it('has the required top-level identity fields', () => {
    expect(marketplace.name).toBe('webpresso')
    expect(marketplace.owner).toBeDefined()
    expect(marketplace.owner.name).toBeTruthy()
  })

  it('declares metadata.version that mirrors package.json#version (drift gate)', () => {
    expect(marketplace.metadata).toBeDefined()
    expect(marketplace.metadata.version).toBe(packageJson.version)
  })

  it('exposes a single self-hosted plugin entry named agent-kit at ./', () => {
    expect(Array.isArray(marketplace.plugins)).toBe(true)
    expect(marketplace.plugins.length).toBeGreaterThan(0)
    const [plugin] = marketplace.plugins
    expect(plugin!.name).toBe('agent-kit')
    expect(plugin!.source).toBe('./')
  })

  it('plugin description matches plugin.json#description when present', () => {
    if (pluginManifest.description) {
      const [plugin] = marketplace.plugins
      expect(plugin!.description).toBe(pluginManifest.description)
    }
  })
})

interface CodexPluginManifest {
  name: string
  version: string
  description?: string
  skills?: string
  mcpServers?: unknown
}

describe('.codex-plugin/plugin.json', () => {
  const packageJson = readJson<PackageJson>(resolve(repoRoot, 'package.json'))
  const codexPlugin = readJson<CodexPluginManifest>(
    resolve(repoRoot, '.codex-plugin', 'plugin.json'),
  )
  const claudePlugin = readJson<{ name: string; skills?: string }>(
    resolve(repoRoot, '.claude-plugin', 'plugin.json'),
  )

  it('shares identity with the Claude plugin (same name + skills dir)', () => {
    expect(codexPlugin.name).toBe('agent-kit')
    expect(codexPlugin.name).toBe(claudePlugin.name)
    expect(codexPlugin.skills).toBe('./skills')
    expect(codexPlugin.skills).toBe(claudePlugin.skills)
  })

  it('mirrors package.json#version (drift gate, synced by sync-marketplace-version)', () => {
    expect(codexPlugin.version).toBe(packageJson.version)
  })

  it('does not use the Claude-only ${CLAUDE_PLUGIN_ROOT} token', () => {
    expect(JSON.stringify(codexPlugin)).not.toContain('CLAUDE_PLUGIN_ROOT')
  })

  it('does not bundle an MCP server (Codex MCP is wired via ~/.codex/config.toml)', () => {
    // Bundling mcpServers here would double-register webpresso alongside the
    // codex-mcp scaffolder's config.toml entry.
    expect(codexPlugin.mcpServers).toBeUndefined()
  })
})
