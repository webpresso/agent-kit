import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import matter from 'gray-matter'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { scaffoldSubagents } from './index.js'

describe('scaffoldSubagents', () => {
  let repoRoot: string

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'wp-subagents-'))
  })

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it('creates self-hosting symlinks from catalog/agent/agents when target is empty', () => {
    writeFileSync(join(repoRoot, 'package.json'), JSON.stringify({ name: 'webpresso' }))
    mkdirSync(join(repoRoot, 'catalog', 'agent', 'agents'), { recursive: true })
    writeFileSync(join(repoRoot, 'catalog', 'agent', 'agents', 'code-reviewer.md'), '# Agent\n')
    writeFileSync(join(repoRoot, 'catalog', 'agent', 'agents', 'README.md'), '# Ignore\n')

    const targetPath = join(repoRoot, '.claude', 'agents', 'code-reviewer.md')
    const results = scaffoldSubagents({ repoRoot, options: {} })

    expect(results).toEqual([{ targetPath, action: 'created' }])
    expect(lstatSync(targetPath).isSymbolicLink()).toBe(true)
    expect(readlinkSync(targetPath)).toBe(
      join('..', '..', 'catalog', 'agent', 'agents', 'code-reviewer.md'),
    )
  })

  it('creates the 4 canonical agent entries for consumers', () => {
    writeFileSync(join(repoRoot, 'package.json'), JSON.stringify({ name: 'consumer-app' }))
    const sourceRoot = join(repoRoot, 'node_modules', 'webpresso', 'catalog', 'agent', 'agents')
    mkdirSync(sourceRoot, { recursive: true })
    writeFileSync(
      join(repoRoot, 'node_modules', 'webpresso', 'package.json'),
      JSON.stringify({ name: 'webpresso' }),
    )
    for (const name of ['code-reviewer', 'security-auditor', 'doc-writer', 'explorer']) {
      writeFileSync(join(sourceRoot, `${name}.md`), `# ${name}\n`)
    }

    const results = scaffoldSubagents({ repoRoot, options: {} })

    expect(results).toHaveLength(4)
    for (const name of ['code-reviewer', 'security-auditor', 'doc-writer', 'explorer']) {
      const targetPath = join(repoRoot, '.claude', 'agents', `${name}.md`)
      expect(existsSync(targetPath)).toBe(true)
      expect(lstatSync(targetPath).isSymbolicLink()).toBe(true)
      expect(readlinkSync(targetPath)).toBe(
        join('..', '..', 'node_modules', 'webpresso', 'catalog', 'agent', 'agents', `${name}.md`),
      )
      expect(readFileSync(targetPath, 'utf8')).toBe(`# ${name}\n`)
    }
  })

  it('preserves custom consumer agents across reruns', () => {
    writeFileSync(join(repoRoot, 'package.json'), JSON.stringify({ name: 'consumer-app' }))
    const sourceRoot = join(repoRoot, 'node_modules', 'webpresso', 'catalog', 'agent', 'agents')
    mkdirSync(sourceRoot, { recursive: true })
    writeFileSync(
      join(repoRoot, 'node_modules', 'webpresso', 'package.json'),
      JSON.stringify({ name: 'webpresso' }),
    )
    writeFileSync(join(sourceRoot, 'code-reviewer.md'), '# code reviewer\n')

    scaffoldSubagents({ repoRoot, options: {} })
    mkdirSync(join(repoRoot, '.claude', 'agents'), { recursive: true })
    const customPath = join(repoRoot, '.claude', 'agents', 'custom.md')
    writeFileSync(customPath, '# custom agent\n')

    const results = scaffoldSubagents({ repoRoot, options: {} })

    expect(readFileSync(customPath, 'utf8')).toBe('# custom agent\n')
    expect(results.some((result) => result.targetPath === customPath)).toBe(false)
  })

  it('falls back to the currently executing package catalog when consumer devDependency is missing', () => {
    writeFileSync(join(repoRoot, 'package.json'), JSON.stringify({ name: 'consumer-app' }))

    const results = scaffoldSubagents({ repoRoot, options: {} })
    const targetPath = join(repoRoot, '.claude', 'agents', 'code-reviewer.md')

    expect(
      results.some((result) => result.targetPath === targetPath && result.action === 'created'),
    ).toBe(true)
    expect(lstatSync(targetPath).isSymbolicLink()).toBe(true)
    expect(readlinkSync(targetPath)).toContain('catalog/agent/agents/code-reviewer.md')
  })

  it('reports drift for wrong-target canonical symlinks without overwriting by default', () => {
    writeFileSync(join(repoRoot, 'package.json'), JSON.stringify({ name: 'webpresso' }))
    mkdirSync(join(repoRoot, 'catalog', 'agent', 'agents'), { recursive: true })
    mkdirSync(join(repoRoot, '.claude', 'agents'), { recursive: true })
    writeFileSync(
      join(repoRoot, 'catalog', 'agent', 'agents', 'code-reviewer.md'),
      '# code reviewer\n',
    )

    const targetPath = join(repoRoot, '.claude', 'agents', 'code-reviewer.md')
    symlinkSync(join('..', '..', '.agent', 'agents', 'code-reviewer.md'), targetPath)

    const results = scaffoldSubagents({ repoRoot, options: {} })

    expect(results).toEqual([{ targetPath, action: 'drifted' }])
  })

  it('keeps the canonical explorer agent read-only and fast', () => {
    const parsed = matter(
      readFileSync(join(process.cwd(), 'catalog', 'agent', 'agents', 'explorer.md'), 'utf8'),
    )
    const tools = Array.isArray(parsed.data.tools) ? parsed.data.tools : []

    expect(parsed.data.model).toBe('haiku')
    expect(tools).toEqual(['Read', 'Grep', 'Glob'])
  })
})
