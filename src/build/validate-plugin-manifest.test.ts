import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const PACKAGE_ROOT = resolve(import.meta.dirname, '..', '..')
const PLUGIN_JSON = join(PACKAGE_ROOT, '.claude-plugin', 'plugin.json')
const FIXTURE = join(PACKAGE_ROOT, '__fixtures__', 'plugin-manifest', 'expected.json')

const PLUGIN_ROOT_VAR = '${CLAUDE_PLUGIN_ROOT}'

function readManifestRaw(): string {
  return readFileSync(PLUGIN_JSON, 'utf-8')
}

interface PluginManifest {
  name: string
  version: string
  description: string
  skills: string
  commands: string
  mcpServers: Record<string, { command: string; args: string[] }>
}

function readManifest(): PluginManifest {
  return JSON.parse(readManifestRaw()) as PluginManifest
}

describe('plugin.json manifest', () => {
  it('exists at .claude-plugin/plugin.json', () => {
    expect(existsSync(PLUGIN_JSON)).toBe(true)
  })

  it('preserves base fields', () => {
    const m = readManifest()
    const packageJson = JSON.parse(readFileSync(join(PACKAGE_ROOT, 'package.json'), 'utf8')) as {
      version: string
    }
    expect(typeof m.name).toBe('string')
    expect(m.version).toBe(packageJson.version)
    expect(typeof m.description).toBe('string')
    expect(m.skills).toBe('./skills')
  })

  it('declares commands directory', () => {
    expect(readManifest().commands).toBe('./commands')
  })

  // Hooks are intentionally NOT declared in the plugin manifest. `wp setup`
  // single-sources them into the consumer's .claude/settings.json instead.
  // Declaring them here too would DOUBLE-FIRE: Claude Code does not dedup hooks
  // across sources unless the command strings are identical, and the manifest's
  // `node ${CLAUDE_PLUGIN_ROOT}/bin/*.js` command differs from the setup-written
  // `.sh` launcher — so both run on every tool call (verified via a controlled
  // `--plugin-dir` repro: a manifest hook and a settings.json hook with
  // different commands both executed on a single Bash tool call). Plugin
  // manifest hooks are also the less reliable surface (they fail to load in
  // several Claude Code contexts), so settings.json is the single source.
  it('declares NO hooks (single-sourced via wp setup into .claude/settings.json)', () => {
    const manifest = JSON.parse(readManifestRaw()) as Record<string, unknown>
    expect(manifest.hooks).toBeUndefined()
  })

  describe('mcpServers', () => {
    it('declares the webpresso stdio server via the stable node wrapper', () => {
      const server = readManifest().mcpServers['webpresso']
      expect(server).toBeDefined()
      expect(server!.command).toBe('node')
      expect(server!.args).toEqual([`${PLUGIN_ROOT_VAR}/bin/wp.js`, 'mcp'])
    })
  })

  it('contains no literal "./dist" paths (must use ${CLAUDE_PLUGIN_ROOT})', () => {
    const raw = readManifestRaw()
    expect(raw.includes('"./dist')).toBe(false)
    // also catch unquoted occurrences anywhere in values
    expect(/[^$]\.\/dist/.test(raw)).toBe(false)
  })

  it('matches the golden snapshot byte-for-byte', () => {
    expect(existsSync(FIXTURE)).toBe(true)
    const actual = readManifestRaw()
    const expected = readFileSync(FIXTURE, 'utf-8')
    expect(actual).toBe(expected)
  })
})
