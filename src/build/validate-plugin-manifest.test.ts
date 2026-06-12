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
  author?: { name?: string; url?: string }
  skills: string
  commands: string
  hooks?: Record<
    string,
    Array<{ matcher?: string; hooks: Array<{ type: string; command: string }> }>
  >
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
    expect(m.author).toEqual({
      name: 'Webpresso',
      url: 'https://github.com/webpresso',
    })
    expect(m.skills).toBe('./skills')
  })

  it('declares commands directory', () => {
    expect(readManifest().commands).toBe('./commands')
  })

  it('declares the expected hook surface using ${CLAUDE_PLUGIN_ROOT} source paths', () => {
    const hooks = readManifest().hooks
    expect(Object.keys(hooks ?? {}).sort()).toEqual([
      'PostToolUse',
      'PreCompact',
      'PreToolUse',
      'SessionStart',
      'Stop',
      'UserPromptSubmit',
    ])

    const commands = Object.values(hooks ?? {})
      .flat()
      .flatMap((entry) => entry.hooks.map((hook) => hook.command))

    expect(commands.every((command) => command.includes(PLUGIN_ROOT_VAR))).toBe(true)
    expect(commands.some((command) => command.includes('/src/hooks/pretool-guard/index.ts'))).toBe(
      true,
    )
    expect(commands.some((command) => command.includes('/src/hooks/post-tool/index.ts'))).toBe(true)
    expect(commands.some((command) => command.includes('/src/hooks/pre-compact/index.ts'))).toBe(
      true,
    )
  })

  describe('mcpServers', () => {
    it('declares the webpresso stdio server via the staged native wp binary', () => {
      const server = readManifest().mcpServers['webpresso']
      expect(server).toBeDefined()
      expect(server!.command).toBe(`${PLUGIN_ROOT_VAR}/bin/wp`)
      expect(server!.args).toEqual(['mcp'])
    })

    it('rejects JS, shell-runtime, and global launchers for Claude startup', () => {
      const manifest = readManifest()
      const launchValues = Object.values(manifest.mcpServers).flatMap((server) => [
        server.command,
        ...server.args,
      ])

      expect(launchValues).not.toContain('node')
      expect(launchValues).not.toContain('bun')
      expect(launchValues).not.toContain('wp')
      expect(launchValues.some((value) => value.endsWith('.js'))).toBe(false)
      expect(launchValues.some((value) => value.includes('/node_modules/.bin/'))).toBe(false)
      expect(launchValues).toContain(`${PLUGIN_ROOT_VAR}/bin/wp`)
    })
  })

  it('contains no literal "./dist" paths (must use ${CLAUDE_PLUGIN_ROOT})', () => {
    const raw = readManifestRaw()
    expect(raw.includes('"./dist')).toBe(false)
    expect(/[^$]\.\/dist/.test(raw)).toBe(false)
  })

  it('matches the golden snapshot byte-for-byte', () => {
    expect(existsSync(FIXTURE)).toBe(true)
    const actual = readManifestRaw()
    const expected = readFileSync(FIXTURE, 'utf-8')
    expect(actual).toBe(expected)
  })
})
