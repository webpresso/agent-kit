import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { flattenAgentDir, writeFlattenedAssets } from './flatten.js'

// ---------------------------------------------------------------------------
// Fixture helpers
// ---------------------------------------------------------------------------

function makeAgentDir(): string {
  return mkdtempSync(join(tmpdir(), 'wp-compile-contract-'))
}

function writeSkill(agentDir: string, name: string, content: string): void {
  mkdirSync(join(agentDir, 'skills', name), { recursive: true })
  writeFileSync(join(agentDir, 'skills', name, 'SKILL.md'), content)
}

function writeCommand(agentDir: string, name: string, content: string): void {
  mkdirSync(join(agentDir, 'commands'), { recursive: true })
  writeFileSync(join(agentDir, 'commands', `${name}.md`), content)
}

function writeAgent(agentDir: string, name: string, content: string): void {
  mkdirSync(join(agentDir, 'agents'), { recursive: true })
  writeFileSync(join(agentDir, 'agents', `${name}.md`), content)
}

// ---------------------------------------------------------------------------
// Fixture content
// ---------------------------------------------------------------------------

const SKILL_CONTENT = `---
name: debug
description: Systematic debugging skill
---

# Debug Skill

Use this skill to debug issues systematically.
`

const COMMAND_CONTENT = `---
description: Run the build pipeline
---

Run build with all checks.
`

const AGENT_CONTENT = `---
name: qa-agent
description: Quality assurance agent
---

# QA Agent

Runs quality checks automatically.
`

// ---------------------------------------------------------------------------
// Contract tests: flatten → output shape
// ---------------------------------------------------------------------------

describe('compile contract: flatten → writeFlattenedAssets output shape', () => {
  let dirs: string[] = []

  beforeEach(() => {
    dirs = []
  })

  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
  })

  function tmp(): string {
    const d = makeAgentDir()
    dirs.push(d)
    return d
  }

  it('output dir contains skills/, commands/, agents/ subdirectories', async () => {
    const agentDir = tmp()
    const outDir = tmp()

    writeSkill(agentDir, 'debug', SKILL_CONTENT)
    writeCommand(agentDir, 'build', COMMAND_CONTENT)
    writeAgent(agentDir, 'qa-agent', AGENT_CONTENT)

    const assets = flattenAgentDir(agentDir)
    await writeFlattenedAssets(assets, outDir)

    const subdirs = readdirSync(outDir).sort()
    expect(subdirs).toStrictEqual(['agents', 'commands', 'skills'])
  })

  it('skill is written as skills/<name>.md with original content', async () => {
    const agentDir = tmp()
    const outDir = tmp()

    writeSkill(agentDir, 'debug', SKILL_CONTENT)

    const assets = flattenAgentDir(agentDir)
    await writeFlattenedAssets(assets, outDir)

    const skillPath = join(outDir, 'skills', 'debug.md')
    expect(existsSync(skillPath)).toBe(true)
    expect(readFileSync(skillPath, 'utf-8')).toBe(SKILL_CONTENT)
  })

  it('command is written as commands/<name>.md with original content', async () => {
    const agentDir = tmp()
    const outDir = tmp()

    writeCommand(agentDir, 'build', COMMAND_CONTENT)

    const assets = flattenAgentDir(agentDir)
    await writeFlattenedAssets(assets, outDir)

    const cmdPath = join(outDir, 'commands', 'build.md')
    expect(existsSync(cmdPath)).toBe(true)
    expect(readFileSync(cmdPath, 'utf-8')).toBe(COMMAND_CONTENT)
  })

  it('agent is written as agents/<name>.md with original content', async () => {
    const agentDir = tmp()
    const outDir = tmp()

    writeAgent(agentDir, 'qa-agent', AGENT_CONTENT)

    const assets = flattenAgentDir(agentDir)
    await writeFlattenedAssets(assets, outDir)

    const agentPath = join(outDir, 'agents', 'qa-agent.md')
    expect(existsSync(agentPath)).toBe(true)
    expect(readFileSync(agentPath, 'utf-8')).toBe(AGENT_CONTENT)
  })

  it('all three asset types written in one pipeline call', async () => {
    const agentDir = tmp()
    const outDir = tmp()

    writeSkill(agentDir, 'debug', SKILL_CONTENT)
    writeCommand(agentDir, 'build', COMMAND_CONTENT)
    writeAgent(agentDir, 'qa-agent', AGENT_CONTENT)

    const assets = flattenAgentDir(agentDir)
    await writeFlattenedAssets(assets, outDir)

    expect(readFileSync(join(outDir, 'skills', 'debug.md'), 'utf-8')).toBe(SKILL_CONTENT)
    expect(readFileSync(join(outDir, 'commands', 'build.md'), 'utf-8')).toBe(COMMAND_CONTENT)
    expect(readFileSync(join(outDir, 'agents', 'qa-agent.md'), 'utf-8')).toBe(AGENT_CONTENT)
  })

  it('multiple skills produce multiple output files keyed by dir name', async () => {
    const agentDir = tmp()
    const outDir = tmp()

    writeSkill(agentDir, 'debug', SKILL_CONTENT)
    writeSkill(agentDir, 'review', `---\nname: review\ndescription: Code review\n---\n# Review\n`)

    const assets = flattenAgentDir(agentDir)
    await writeFlattenedAssets(assets, outDir)

    const written = readdirSync(join(outDir, 'skills')).sort()
    expect(written).toStrictEqual(['debug.md', 'review.md'])
  })

  it('empty agent dir produces empty subdirectory files', async () => {
    const agentDir = tmp()
    const outDir = tmp()

    const assets = flattenAgentDir(agentDir)
    await writeFlattenedAssets(assets, outDir)

    expect(readdirSync(join(outDir, 'skills'))).toHaveLength(0)
    expect(readdirSync(join(outDir, 'commands'))).toHaveLength(0)
    expect(readdirSync(join(outDir, 'agents'))).toHaveLength(0)
  })

  it('FlattenedAssets object has correct shape with expected keys', () => {
    const agentDir = tmp()

    writeSkill(agentDir, 'debug', SKILL_CONTENT)
    writeCommand(agentDir, 'build', COMMAND_CONTENT)
    writeAgent(agentDir, 'qa-agent', AGENT_CONTENT)

    const assets = flattenAgentDir(agentDir)

    expect(typeof assets.skills).toBe('object')
    expect(typeof assets.commands).toBe('object')
    expect(typeof assets.agents).toBe('object')
    expect(Object.keys(assets.skills)).toContain('debug')
    expect(Object.keys(assets.commands)).toContain('build')
    expect(Object.keys(assets.agents)).toContain('qa-agent')
  })
})

// ---------------------------------------------------------------------------
// Version contract: rulesync pinned version
// ---------------------------------------------------------------------------

describe('compile contract: rulesync version pin', () => {
  it('installed rulesync matches pinned version 8.15.1 (skipped if not installed)', () => {
    const pkgPath = join(process.cwd(), 'node_modules', 'rulesync', 'package.json')
    if (!existsSync(pkgPath)) {
      // Skip gracefully when rulesync is not installed in this environment
      return
    }

    const raw = readFileSync(pkgPath, 'utf-8')
    const parsed = JSON.parse(raw) as Record<string, unknown>
    expect(typeof parsed.version).toBe('string')
    expect(parsed.version).toBe('8.15.1')
  })
})
