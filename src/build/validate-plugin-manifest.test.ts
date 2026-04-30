import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const PACKAGE_ROOT = resolve(import.meta.dirname, '..', '..')
const PLUGIN_JSON = join(PACKAGE_ROOT, '.claude-plugin', 'plugin.json')
const FIXTURE = join(
  PACKAGE_ROOT,
  '__fixtures__',
  'plugin-manifest',
  'expected.json',
)

const PLUGIN_ROOT_VAR = '${CLAUDE_PLUGIN_ROOT}'

function readManifestRaw(): string {
  return readFileSync(PLUGIN_JSON, 'utf-8')
}

interface HookHandler {
  type: string
  command: string
}

interface HookEntry {
  matcher?: string
  hooks: HookHandler[]
}

interface PluginManifest {
  name: string
  version: string
  description: string
  skills: string
  commands: string
  hooks: {
    PreToolUse: HookEntry[]
    PostToolUse: HookEntry[]
    Stop: HookEntry[]
    SessionStart: HookEntry[]
  }
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
    expect(typeof m.name).toBe('string')
    expect(typeof m.version).toBe('string')
    expect(typeof m.description).toBe('string')
    expect(m.skills).toBe('./skills')
  })

  it('declares commands directory', () => {
    expect(readManifest().commands).toBe('./commands')
  })

  describe('hooks', () => {
    it('PreToolUse matches Bash|Edit|Write|WebFetch|Read|Grep and points at pretool-guard via ${CLAUDE_PLUGIN_ROOT}', () => {
      const [entry] = readManifest().hooks.PreToolUse
      expect(entry.matcher).toBe('Bash|Edit|Write|WebFetch|Read|Grep')
      const [handler] = entry.hooks
      expect(handler.type).toBe('command')
      expect(handler.command).toBe(
        `${PLUGIN_ROOT_VAR}/dist/esm/hooks/pretool-guard/index.js`,
      )
    })

    it('PostToolUse matches Edit|Write and points at lint-after-edit', () => {
      const [entry] = readManifest().hooks.PostToolUse
      expect(entry.matcher).toBe('Edit|Write')
      const [handler] = entry.hooks
      expect(handler.type).toBe('command')
      expect(handler.command).toBe(
        `${PLUGIN_ROOT_VAR}/dist/esm/hooks/post-tool/lint-after-edit.js`,
      )
    })

    it('Stop has no matcher and points at qa-changed-files', () => {
      const [entry] = readManifest().hooks.Stop
      expect(entry.matcher).toBeUndefined()
      const [handler] = entry.hooks
      expect(handler.type).toBe('command')
      expect(handler.command).toBe(
        `${PLUGIN_ROOT_VAR}/dist/esm/hooks/stop/qa-changed-files.js`,
      )
    })

    it('SessionStart matches startup|resume|compact and points at sessionstart/index.js', () => {
      const [entry] = readManifest().hooks.SessionStart
      expect(entry.matcher).toBe('startup|resume|compact')
      const [handler] = entry.hooks
      expect(handler.type).toBe('command')
      expect(handler.command).toBe(
        `${PLUGIN_ROOT_VAR}/dist/esm/hooks/sessionstart/index.js`,
      )
    })
  })

  describe('mcpServers', () => {
    it('declares the agent-kit stdio server via node + ${CLAUDE_PLUGIN_ROOT}', () => {
      const server = readManifest().mcpServers['agent-kit']
      expect(server).toBeDefined()
      expect(server.command).toBe('node')
      expect(server.args).toEqual([`${PLUGIN_ROOT_VAR}/dist/esm/mcp/cli.js`])
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
