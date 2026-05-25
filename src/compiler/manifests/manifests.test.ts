import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { emitManifest as emitClaude } from './claude.js'
import { emitManifest as emitCodex } from './codex.js'
import { emitManifest as emitCursor } from './cursor.js'
import { emitManifest as emitGemini } from './gemini.js'

function makeTmp(): string {
  return mkdtempSync(join(tmpdir(), 'wp-manifest-'))
}

function readJson(filePath: string): Record<string, unknown> {
  return JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, unknown>
}

const BASE_OPTS = {
  agentDir: '',
  version: '1.2.3',
  skills: ['debug', 'investigate'],
  commands: ['build', 'test'],
}

describe('claude manifest emitter', () => {
  let dirs: string[] = []

  beforeEach(() => {
    dirs = []
  })
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
  })

  function tmp(): string {
    const d = makeTmp()
    dirs.push(d)
    return d
  }

  it('emits .claude-plugin/plugin.json with required fields', async () => {
    const outDir = tmp()
    const agentDir = tmp()
    await emitClaude({ ...BASE_OPTS, agentDir, outDir })
    const json = readJson(join(outDir, '.claude-plugin', 'plugin.json'))
    expect(json['name']).toBe('webpresso')
    expect(json['version']).toBe('1.2.3')
    expect(Array.isArray(json['skills'])).toBe(true)
    expect((json['skills'] as unknown[]).length).toBe(2)
    expect(json['_generated']).toMatch(/agent-kit/)
  })

  it('emits .claude-plugin/marketplace.json with skill names and schemaVersion', async () => {
    const outDir = tmp()
    const agentDir = tmp()
    await emitClaude({ ...BASE_OPTS, agentDir, outDir })
    const json = readJson(join(outDir, '.claude-plugin', 'marketplace.json'))
    expect(json['name']).toBe('webpresso')
    expect(json['skills']).toStrictEqual(['debug', 'investigate'])
    expect(json['schemaVersion']).toBe('1.0.0')
    expect(json['_generated']).toMatch(/agent-kit/)
  })

  it('plugin.json skills list maps to correct paths', async () => {
    const outDir = tmp()
    const agentDir = tmp()
    await emitClaude({ ...BASE_OPTS, agentDir, outDir })
    const json = readJson(join(outDir, '.claude-plugin', 'plugin.json'))
    const skills = json['skills'] as Array<{ path: string }>
    expect(skills[0]).toStrictEqual({ path: 'skills/debug/SKILL.md' })
  })
})

describe('codex manifest emitter', () => {
  let dirs: string[] = []

  beforeEach(() => {
    dirs = []
  })
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
  })

  function tmp(): string {
    const d = makeTmp()
    dirs.push(d)
    return d
  }

  it('emits .codex-plugin/plugin.json with required fields', async () => {
    const outDir = tmp()
    const agentDir = tmp()
    await emitCodex({ ...BASE_OPTS, agentDir, outDir })
    const json = readJson(join(outDir, '.codex-plugin', 'plugin.json'))
    expect(json['name']).toBe('@webpresso/agent-kit')
    expect(json['version']).toBe('1.2.3')
    expect(Array.isArray(json['skills'])).toBe(true)
    expect(json['apps']).toStrictEqual([])
    expect(json['_generated']).toMatch(/agent-kit/)
  })

  it('skills list maps to correct paths', async () => {
    const outDir = tmp()
    const agentDir = tmp()
    await emitCodex({ ...BASE_OPTS, agentDir, outDir })
    const json = readJson(join(outDir, '.codex-plugin', 'plugin.json'))
    const skills = json['skills'] as Array<{ path: string }>
    expect(skills[1]).toStrictEqual({ path: 'skills/investigate/SKILL.md' })
  })
})

describe('cursor manifest emitter', () => {
  let dirs: string[] = []

  beforeEach(() => {
    dirs = []
  })
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
  })

  function tmp(): string {
    const d = makeTmp()
    dirs.push(d)
    return d
  }

  it('emits .cursor-plugin/plugin.json with name, version, skills', async () => {
    const outDir = tmp()
    const agentDir = tmp()
    await emitCursor({ ...BASE_OPTS, agentDir, outDir })
    const json = readJson(join(outDir, '.cursor-plugin', 'plugin.json'))
    expect(json['name']).toBe('@webpresso/agent-kit')
    expect(json['version']).toBe('1.2.3')
    expect(Array.isArray(json['skills'])).toBe(true)
    expect(json['_generated']).toMatch(/agent-kit/)
  })

  it('rules field is an array (empty when no rules dir)', async () => {
    const outDir = tmp()
    const agentDir = tmp()
    await emitCursor({ ...BASE_OPTS, agentDir, outDir })
    const json = readJson(join(outDir, '.cursor-plugin', 'plugin.json'))
    expect(Array.isArray(json['rules'])).toBe(true)
  })

  it('rules field includes paths when rules exist in agentDir', async () => {
    const outDir = tmp()
    const agentDir = tmp()
    mkdirSync(join(agentDir, 'rules'), { recursive: true })
    const { writeFileSync } = await import('node:fs')
    writeFileSync(join(agentDir, 'rules', 'my-rule.md'), '# rule')
    await emitCursor({ ...BASE_OPTS, agentDir, outDir })
    const json = readJson(join(outDir, '.cursor-plugin', 'plugin.json'))
    expect((json['rules'] as string[]).some((r) => r.includes('my-rule'))).toBe(true)
  })
})

describe('gemini manifest emitter', () => {
  let dirs: string[] = []

  beforeEach(() => {
    dirs = []
  })
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
  })

  function tmp(): string {
    const d = makeTmp()
    dirs.push(d)
    return d
  }

  it('emits gemini-extension.json with required fields', async () => {
    const outDir = tmp()
    const agentDir = tmp()
    await emitGemini({ ...BASE_OPTS, agentDir, outDir })
    const json = readJson(join(outDir, 'gemini-extension.json'))
    expect(json['name']).toBe('webpresso-agent-kit')
    expect(json['version']).toBe('1.2.3')
    expect(Array.isArray(json['commands'])).toBe(true)
    expect(json['schemaVersion']).toBe('0.4.0')
    expect(json['_generated']).toMatch(/agent-kit/)
  })

  it('commands list maps to correct paths', async () => {
    const outDir = tmp()
    const agentDir = tmp()
    await emitGemini({ ...BASE_OPTS, agentDir, outDir })
    const json = readJson(join(outDir, 'gemini-extension.json'))
    const commands = json['commands'] as Array<{ path: string }>
    expect(commands[0]).toStrictEqual({ path: 'commands/build.md' })
    expect(commands[1]).toStrictEqual({ path: 'commands/test.md' })
  })
})
