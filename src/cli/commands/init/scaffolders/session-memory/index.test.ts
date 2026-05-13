import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  scaffoldSessionMemory,
  hasContextModeEntries,
  removeContextModeEntries,
  type PluginJson,
} from './index.js'

let tmpDir: string
let repoRoot: string
let sessionsDir: string

beforeEach(() => {
  tmpDir = mkdtempSync(join(tmpdir(), 'ak-scaffold-sm-test-'))
  repoRoot = join(tmpDir, 'repo')
  sessionsDir = join(tmpDir, 'sessions')
  mkdirSync(join(repoRoot, '.claude-plugin'), { recursive: true })
})

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true })
})

function writePluginJson(content: unknown): void {
  writeFileSync(join(repoRoot, '.claude-plugin', 'plugin.json'), JSON.stringify(content, null, 2))
}

describe('hasContextModeEntries', () => {
  it('returns false for plugin with no mcpServers', () => {
    const plugin: PluginJson = { name: 'test' }
    expect(hasContextModeEntries(plugin)).toBe(false)
  })

  it('returns false for plugin with other mcpServers', () => {
    const plugin: PluginJson = { mcpServers: { 'other-tool': { command: 'other' } } }
    expect(hasContextModeEntries(plugin)).toBe(false)
  })

  it('returns true when context-mode key is present', () => {
    const plugin: PluginJson = { mcpServers: { 'context-mode': { command: 'context-mode' } } }
    expect(hasContextModeEntries(plugin)).toBe(true)
  })

  it('returns true when context_mode key is present', () => {
    const plugin: PluginJson = { mcpServers: { context_mode: { command: 'ctx' } } }
    expect(hasContextModeEntries(plugin)).toBe(true)
  })
})

describe('removeContextModeEntries', () => {
  it('removes context-mode key from mcpServers', () => {
    const plugin: PluginJson = {
      mcpServers: { 'context-mode': { command: 'ctx' }, 'agent-kit': { command: 'bun' } },
    }
    const result = removeContextModeEntries(plugin)
    expect(result.mcpServers).not.toHaveProperty('context-mode')
    expect(result.mcpServers).toHaveProperty('agent-kit')
  })

  it('preserves other plugin fields', () => {
    const plugin: PluginJson = {
      name: 'test',
      version: '1.0',
      mcpServers: { 'context-mode': {} },
    }
    const result = removeContextModeEntries(plugin)
    expect(result.name).toBe('test')
    expect(result.version).toBe('1.0')
  })
})

describe('scaffoldSessionMemory', () => {
  it('clean install (no context-mode) — creates sessions dir, no migration', () => {
    writePluginJson({ name: 'test', mcpServers: { 'agent-kit': {} } })

    const result = scaffoldSessionMemory({
      repoRoot,
      options: {},
      sessionsDir,
    })

    expect(result.kind).toBe('ok')
    if (result.kind === 'ok') {
      expect(result.migrated).toBe(false)
      expect(result.backupPath).toBeNull()
    }
  })

  it('standard install — removes context-mode, writes backup', () => {
    writePluginJson({
      name: 'test',
      mcpServers: {
        'context-mode': { command: 'context-mode', args: ['mcp'] },
        'agent-kit': { command: 'bun' },
      },
    })

    const result = scaffoldSessionMemory({ repoRoot, options: {}, sessionsDir })

    expect(result.kind).toBe('ok')
    if (result.kind === 'ok') {
      expect(result.migrated).toBe(true)
      expect(result.backupPath).toBeTruthy()
    }

    // Plugin.json should no longer have context-mode
    const updated = JSON.parse(
      readFileSync(join(repoRoot, '.claude-plugin', 'plugin.json'), 'utf8'),
    ) as PluginJson
    expect(updated.mcpServers).not.toHaveProperty('context-mode')
    expect(updated.mcpServers).toHaveProperty('agent-kit')
  })

  it('idempotent re-run — second call is no-op', () => {
    writePluginJson({
      name: 'test',
      mcpServers: {
        'context-mode': { command: 'context-mode' },
        'agent-kit': { command: 'bun' },
      },
    })

    scaffoldSessionMemory({ repoRoot, options: {}, sessionsDir })
    const second = scaffoldSessionMemory({ repoRoot, options: {}, sessionsDir })

    expect(second.kind).toBe('ok')
    if (second.kind === 'ok') {
      expect(second.migrated).toBe(false) // already migrated
      expect(second.backupPath).toBeNull()
    }
  })

  it('dry-run — returns dry-run result without writing', () => {
    writePluginJson({ mcpServers: { 'context-mode': {} } })
    const result = scaffoldSessionMemory({ repoRoot, options: { dryRun: true }, sessionsDir })
    expect(result.kind).toBe('dry-run')
  })

  it('malformed plugin.json — preserved unchanged, returns malformed result', () => {
    writeFileSync(join(repoRoot, '.claude-plugin', 'plugin.json'), 'NOT { VALID JSON }')

    const result = scaffoldSessionMemory({ repoRoot, options: {}, sessionsDir })
    expect(result.kind).toBe('malformed-plugin-json')

    // Original file should be untouched
    const raw = readFileSync(join(repoRoot, '.claude-plugin', 'plugin.json'), 'utf8')
    expect(raw).toBe('NOT { VALID JSON }')
  })

  it('backup file format is <filename>.pre-session-memory-backup.<timestamp>.json', () => {
    writePluginJson({ mcpServers: { 'context-mode': {} } })

    const result = scaffoldSessionMemory({ repoRoot, options: {}, sessionsDir })
    expect(result.kind).toBe('ok')
    if (result.kind === 'ok' && result.backupPath) {
      expect(result.backupPath).toMatch(/plugin\.pre-session-memory-backup\.\d+\.json$/)
    }
  })
})
