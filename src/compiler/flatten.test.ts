import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { flattenAgentDir, writeFlattenedAssets } from './flatten.js'

function makeTmp(): string {
  return mkdtempSync(join(tmpdir(), 'ak-flatten-'))
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

const VALID_SKILL_MD = `---
name: debug
description: Systematic debugging skill
---

# Debug

Use this skill to debug issues.
`

const VALID_COMMAND_MD = `---
description: Run the build pipeline
---

Run build with all checks.
`

const VALID_AGENT_MD = `---
name: qa-agent
description: Quality assurance agent
---

# QA Agent

Runs quality checks.
`

describe('flattenAgentDir', () => {
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

  it('returns empty records when agent dir has no assets', () => {
    const agentDir = tmp()
    const result = flattenAgentDir(agentDir)
    expect(result.skills).toStrictEqual({})
    expect(result.commands).toStrictEqual({})
    expect(result.agents).toStrictEqual({})
  })

  it('reads a skill from skills/<name>/SKILL.md using dir name as key', () => {
    const agentDir = tmp()
    writeSkill(agentDir, 'debug', VALID_SKILL_MD)

    const result = flattenAgentDir(agentDir)
    expect(Object.keys(result.skills)).toStrictEqual(['debug'])
    expect(result.skills['debug']).toContain('name: debug')
  })

  it('reads multiple skills and keys them by dir name', () => {
    const agentDir = tmp()
    writeSkill(agentDir, 'debug', VALID_SKILL_MD)
    writeSkill(agentDir, 'review', `---\nname: review\ndescription: Code review skill\n---\n# Review\n`)

    const result = flattenAgentDir(agentDir)
    expect(Object.keys(result.skills).sort()).toStrictEqual(['debug', 'review'])
  })

  it('reads a command from commands/<name>.md using file stem as key', () => {
    const agentDir = tmp()
    writeCommand(agentDir, 'build', VALID_COMMAND_MD)

    const result = flattenAgentDir(agentDir)
    expect(Object.keys(result.commands)).toStrictEqual(['build'])
    expect(result.commands['build']).toContain('description: Run the build pipeline')
  })

  it('reads an agent from agents/<name>.md using file stem as key', () => {
    const agentDir = tmp()
    writeAgent(agentDir, 'qa-agent', VALID_AGENT_MD)

    const result = flattenAgentDir(agentDir)
    expect(Object.keys(result.agents)).toStrictEqual(['qa-agent'])
    expect(result.agents['qa-agent']).toContain('name: qa-agent')
  })

  it('reads all three asset types together', () => {
    const agentDir = tmp()
    writeSkill(agentDir, 'debug', VALID_SKILL_MD)
    writeCommand(agentDir, 'build', VALID_COMMAND_MD)
    writeAgent(agentDir, 'qa-agent', VALID_AGENT_MD)

    const result = flattenAgentDir(agentDir)
    expect(Object.keys(result.skills)).toHaveLength(1)
    expect(Object.keys(result.commands)).toHaveLength(1)
    expect(Object.keys(result.agents)).toHaveLength(1)
  })

  it('preserves full file content including frontmatter', () => {
    const agentDir = tmp()
    writeSkill(agentDir, 'debug', VALID_SKILL_MD)

    const result = flattenAgentDir(agentDir)
    expect(result.skills['debug']).toBe(VALID_SKILL_MD)
  })

  it('does not throw when frontmatter fails validation — emits warning instead', () => {
    const agentDir = tmp()
    // Missing required 'name' field
    const invalidSkill = `---\ndescription: no name field\n---\n# Broken\n`
    writeSkill(agentDir, 'broken', invalidSkill)

    // Should not throw
    expect(() => flattenAgentDir(agentDir)).not.toThrow()
    const result = flattenAgentDir(agentDir)
    expect(result.skills['broken']).toBe(invalidSkill)
  })
})

describe('writeFlattenedAssets', () => {
  let dirs: string[] = []

  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true })
  })

  function tmp(): string {
    const d = makeTmp()
    dirs.push(d)
    return d
  }

  it('creates output directory structure with skills/commands/agents subdirs', async () => {
    const outDir = tmp()
    const assets = { skills: {}, commands: {}, agents: {} }

    await writeFlattenedAssets(assets, outDir)

    const subdirs = readdirSync(outDir).sort()
    expect(subdirs).toStrictEqual(['agents', 'commands', 'skills'])
  })

  it('writes skill files to skills/<name>.md', async () => {
    const outDir = tmp()
    const assets = {
      skills: { debug: VALID_SKILL_MD },
      commands: {},
      agents: {},
    }

    await writeFlattenedAssets(assets, outDir)

    const content = readFileSync(join(outDir, 'skills', 'debug.md'), 'utf-8')
    expect(content).toBe(VALID_SKILL_MD)
  })

  it('writes command files to commands/<name>.md', async () => {
    const outDir = tmp()
    const assets = {
      skills: {},
      commands: { build: VALID_COMMAND_MD },
      agents: {},
    }

    await writeFlattenedAssets(assets, outDir)

    const content = readFileSync(join(outDir, 'commands', 'build.md'), 'utf-8')
    expect(content).toBe(VALID_COMMAND_MD)
  })

  it('writes agent files to agents/<name>.md', async () => {
    const outDir = tmp()
    const assets = {
      skills: {},
      commands: {},
      agents: { 'qa-agent': VALID_AGENT_MD },
    }

    await writeFlattenedAssets(assets, outDir)

    const content = readFileSync(join(outDir, 'agents', 'qa-agent.md'), 'utf-8')
    expect(content).toBe(VALID_AGENT_MD)
  })

  it('writes all asset types in one call', async () => {
    const outDir = tmp()
    const assets = {
      skills: { debug: VALID_SKILL_MD },
      commands: { build: VALID_COMMAND_MD },
      agents: { 'qa-agent': VALID_AGENT_MD },
    }

    await writeFlattenedAssets(assets, outDir)

    expect(readFileSync(join(outDir, 'skills', 'debug.md'), 'utf-8')).toBe(VALID_SKILL_MD)
    expect(readFileSync(join(outDir, 'commands', 'build.md'), 'utf-8')).toBe(VALID_COMMAND_MD)
    expect(readFileSync(join(outDir, 'agents', 'qa-agent.md'), 'utf-8')).toBe(VALID_AGENT_MD)
  })
})
