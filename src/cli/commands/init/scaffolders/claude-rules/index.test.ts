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

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { scaffoldClaudeRules } from './index.js'

describe('scaffoldClaudeRules', () => {
  let repoRoot: string

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'ak-claude-rules-'))
  })

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it('returns no work when the self-host rules source is missing', () => {
    writeFileSync(join(repoRoot, 'package.json'), JSON.stringify({ name: '@webpresso/agent-kit' }))
    const results = scaffoldClaudeRules({ repoRoot, options: {} })

    expect(results).toEqual([])
    expect(existsSync(join(repoRoot, '.claude', 'rules'))).toBe(false)
  })

  it('creates self-hosting symlinks from catalog/agent/rules when the target is empty', () => {
    writeFileSync(join(repoRoot, 'package.json'), JSON.stringify({ name: '@webpresso/agent-kit' }))
    mkdirSync(join(repoRoot, 'catalog', 'agent', 'rules'), { recursive: true })
    writeFileSync(join(repoRoot, 'catalog', 'agent', 'rules', 'rule-a.md'), '# Rule A\n')
    writeFileSync(join(repoRoot, 'catalog', 'agent', 'rules', 'README.md'), '# Ignore me\n')

    const results = scaffoldClaudeRules({ repoRoot, options: {} })
    const targetPath = join(repoRoot, '.claude', 'rules', 'rule-a.md')

    expect(results).toEqual([{ targetPath, action: 'created' }])
    expect(lstatSync(targetPath).isSymbolicLink()).toBe(true)
    expect(readlinkSync(targetPath)).toBe(
      join('..', '..', 'catalog', 'agent', 'rules', 'rule-a.md'),
    )
  })

  it('is idempotent on rerun when the self-host symlink already exists', () => {
    writeFileSync(join(repoRoot, 'package.json'), JSON.stringify({ name: '@webpresso/agent-kit' }))
    mkdirSync(join(repoRoot, 'catalog', 'agent', 'rules'), { recursive: true })
    writeFileSync(join(repoRoot, 'catalog', 'agent', 'rules', 'rule-a.md'), '# Rule A\n')

    const targetPath = join(repoRoot, '.claude', 'rules', 'rule-a.md')

    expect(scaffoldClaudeRules({ repoRoot, options: {} })).toEqual([
      { targetPath, action: 'created' },
    ])
    expect(scaffoldClaudeRules({ repoRoot, options: {} })).toEqual([
      { targetPath, action: 'identical' },
    ])
    expect(lstatSync(targetPath).isSymbolicLink()).toBe(true)
  })

  it('preserves a consumer-owned real file instead of replacing it', () => {
    writeFileSync(join(repoRoot, 'package.json'), JSON.stringify({ name: '@webpresso/agent-kit' }))
    mkdirSync(join(repoRoot, 'catalog', 'agent', 'rules'), { recursive: true })
    mkdirSync(join(repoRoot, '.claude', 'rules'), { recursive: true })
    writeFileSync(join(repoRoot, 'catalog', 'agent', 'rules', 'rule-a.md'), '# Rule A\n')

    const targetPath = join(repoRoot, '.claude', 'rules', 'rule-a.md')
    writeFileSync(targetPath, 'consumer content\n')

    const results = scaffoldClaudeRules({ repoRoot, options: {} })

    expect(results).toEqual([{ targetPath, action: 'identical' }])
    expect(lstatSync(targetPath).isFile()).toBe(true)
    expect(readFileSync(targetPath, 'utf8')).toBe('consumer content\n')
  })

  it('reports creates in dry-run mode without touching disk', () => {
    writeFileSync(join(repoRoot, 'package.json'), JSON.stringify({ name: '@webpresso/agent-kit' }))
    mkdirSync(join(repoRoot, 'catalog', 'agent', 'rules'), { recursive: true })
    writeFileSync(join(repoRoot, 'catalog', 'agent', 'rules', 'rule-a.md'), '# Rule A\n')

    const targetPath = join(repoRoot, '.claude', 'rules', 'rule-a.md')
    const results = scaffoldClaudeRules({ repoRoot, options: { dryRun: true } })

    expect(results).toEqual([{ targetPath, action: 'created' }])
    expect(existsSync(join(repoRoot, '.claude', 'rules'))).toBe(false)
  })

  it('creates consumer symlinks against the installed package catalog', () => {
    writeFileSync(join(repoRoot, 'package.json'), JSON.stringify({ name: 'consumer-app' }))
    mkdirSync(
      join(repoRoot, 'node_modules', '@webpresso', 'agent-kit', 'catalog', 'agent', 'rules'),
      {
        recursive: true,
      },
    )
    writeFileSync(
      join(repoRoot, 'node_modules', '@webpresso', 'agent-kit', 'package.json'),
      JSON.stringify({ name: '@webpresso/agent-kit', exports: { './catalog/*': './catalog/*' } }),
    )
    writeFileSync(
      join(
        repoRoot,
        'node_modules',
        '@webpresso',
        'agent-kit',
        'catalog',
        'agent',
        'rules',
        'rule-a.md',
      ),
      '# Rule A\n',
    )
    writeFileSync(
      join(
        repoRoot,
        'node_modules',
        '@webpresso',
        'agent-kit',
        'catalog',
        'agent',
        'rules',
        'agent-guide.md',
      ),
      '# Guide\n',
    )

    const results = scaffoldClaudeRules({ repoRoot, options: {} })
    const targetPath = join(repoRoot, '.claude', 'rules', 'rule-a.md')

    expect(results).toContainEqual({ targetPath, action: 'created' })
    expect(readlinkSync(targetPath)).toBe(
      join(
        '..',
        '..',
        'node_modules',
        '@webpresso',
        'agent-kit',
        'catalog',
        'agent',
        'rules',
        'rule-a.md',
      ),
    )
    expect(readFileSync(targetPath, 'utf8')).toBe('# Rule A\n')
  })

  it('falls back to the currently executing package catalog when consumer devDependency is missing', () => {
    writeFileSync(join(repoRoot, 'package.json'), JSON.stringify({ name: 'consumer-app' }))

    const results = scaffoldClaudeRules({ repoRoot, options: {} })
    const targetPath = join(repoRoot, '.claude', 'rules', 'agent-guide.md')

    expect(
      results.some((result) => result.targetPath === targetPath && result.action === 'created'),
    ).toBe(true)
    expect(lstatSync(targetPath).isSymbolicLink()).toBe(true)
    expect(readlinkSync(targetPath)).toContain('catalog/agent/rules/agent-guide.md')
  })

  it('supports pnpm-style nested installs through the hoisted symlink entry', () => {
    writeFileSync(join(repoRoot, 'package.json'), JSON.stringify({ name: 'consumer-app' }))
    const nestedPkg = join(
      repoRoot,
      'node_modules',
      '.pnpm',
      '@webpresso+agent-kit@1.0.0',
      'node_modules',
      '@webpresso',
      'agent-kit',
    )
    mkdirSync(join(nestedPkg, 'catalog', 'agent', 'rules'), { recursive: true })
    writeFileSync(
      join(nestedPkg, 'package.json'),
      JSON.stringify({ name: '@webpresso/agent-kit', exports: { './catalog/*': './catalog/*' } }),
    )
    writeFileSync(join(nestedPkg, 'catalog', 'agent', 'rules', 'rule-a.md'), '# Rule A\n')
    writeFileSync(join(nestedPkg, 'catalog', 'agent', 'rules', 'agent-guide.md'), '# Guide\n')
    mkdirSync(join(repoRoot, 'node_modules', '@webpresso'), { recursive: true })
    symlinkSync(nestedPkg, join(repoRoot, 'node_modules', '@webpresso', 'agent-kit'))

    const results = scaffoldClaudeRules({ repoRoot, options: {} })
    const targetPath = join(repoRoot, '.claude', 'rules', 'rule-a.md')

    expect(results).toContainEqual({ targetPath, action: 'created' })
    expect(readlinkSync(targetPath)).toBe(
      join(
        '..',
        '..',
        'node_modules',
        '@webpresso',
        'agent-kit',
        'catalog',
        'agent',
        'rules',
        'rule-a.md',
      ),
    )
    expect(lstatSync(targetPath).isSymbolicLink()).toBe(true)
    expect(readFileSync(targetPath, 'utf8')).toBe('# Rule A\n')
  })

  it('materializes allowlisted override rules as real files instead of symlinks', () => {
    writeFileSync(join(repoRoot, 'package.json'), JSON.stringify({ name: 'consumer-app' }))
    writeFileSync(
      join(repoRoot, '.agent-kitrc.json'),
      JSON.stringify(
        {
          version: '1',
          installed: { tier3Skills: [] },
          rules: { overrides: ['rule-a'] },
          scripts: {},
          durablePlanningRoot: '.agent/planning/',
        },
        null,
        2,
      ),
    )
    mkdirSync(
      join(repoRoot, 'node_modules', '@webpresso', 'agent-kit', 'catalog', 'agent', 'rules'),
      { recursive: true },
    )
    writeFileSync(
      join(repoRoot, 'node_modules', '@webpresso', 'agent-kit', 'package.json'),
      JSON.stringify({ name: '@webpresso/agent-kit', exports: { './catalog/*': './catalog/*' } }),
    )
    writeFileSync(
      join(
        repoRoot,
        'node_modules',
        '@webpresso',
        'agent-kit',
        'catalog',
        'agent',
        'rules',
        'rule-a.md',
      ),
      '# Rule A\n',
    )

    const targetPath = join(repoRoot, '.claude', 'rules', 'rule-a.md')
    const results = scaffoldClaudeRules({ repoRoot, options: {} })

    expect(results).toContainEqual({ targetPath, action: 'created' })
    expect(lstatSync(targetPath).isFile()).toBe(true)
    expect(readFileSync(targetPath, 'utf8')).toBe('# Rule A\n')
  })

  it('replaces allowlisted override symlinks with real files on rerun', () => {
    writeFileSync(join(repoRoot, 'package.json'), JSON.stringify({ name: 'consumer-app' }))
    writeFileSync(
      join(repoRoot, '.agent-kitrc.json'),
      JSON.stringify(
        {
          version: '1',
          installed: { tier3Skills: [] },
          rules: { overrides: ['rule-a'] },
          scripts: {},
          durablePlanningRoot: '.agent/planning/',
        },
        null,
        2,
      ),
    )
    mkdirSync(
      join(repoRoot, 'node_modules', '@webpresso', 'agent-kit', 'catalog', 'agent', 'rules'),
      { recursive: true },
    )
    writeFileSync(
      join(repoRoot, 'node_modules', '@webpresso', 'agent-kit', 'package.json'),
      JSON.stringify({ name: '@webpresso/agent-kit', exports: { './catalog/*': './catalog/*' } }),
    )
    writeFileSync(
      join(
        repoRoot,
        'node_modules',
        '@webpresso',
        'agent-kit',
        'catalog',
        'agent',
        'rules',
        'rule-a.md',
      ),
      '# Rule A\n',
    )
    mkdirSync(join(repoRoot, '.claude', 'rules'), { recursive: true })
    symlinkSync(
      join(
        '..',
        '..',
        'node_modules',
        '@webpresso',
        'agent-kit',
        'catalog',
        'agent',
        'rules',
        'rule-a.md',
      ),
      join(repoRoot, '.claude', 'rules', 'rule-a.md'),
    )

    const targetPath = join(repoRoot, '.claude', 'rules', 'rule-a.md')
    const results = scaffoldClaudeRules({ repoRoot, options: {} })

    expect(results).toContainEqual({ targetPath, action: 'overwritten' })
    expect(lstatSync(targetPath).isFile()).toBe(true)
    expect(readFileSync(targetPath, 'utf8')).toBe('# Rule A\n')
  })

  it('reports drift for wrong-target symlinks without overwriting by default', () => {
    writeFileSync(join(repoRoot, 'package.json'), JSON.stringify({ name: '@webpresso/agent-kit' }))
    mkdirSync(join(repoRoot, 'catalog', 'agent', 'rules'), { recursive: true })
    mkdirSync(join(repoRoot, '.claude', 'rules'), { recursive: true })
    writeFileSync(join(repoRoot, 'catalog', 'agent', 'rules', 'rule-a.md'), '# Rule A\n')

    const targetPath = join(repoRoot, '.claude', 'rules', 'rule-a.md')
    symlinkSync(join('..', '..', '.agent', 'rules', 'rule-a.md'), targetPath)

    const results = scaffoldClaudeRules({ repoRoot, options: {} })

    expect(results).toEqual([{ targetPath, action: 'drifted' }])
    expect(readlinkSync(targetPath)).toBe(join('..', '..', '.agent', 'rules', 'rule-a.md'))
  })

  it('replaces wrong-target symlinks when overwrite is enabled', () => {
    writeFileSync(join(repoRoot, 'package.json'), JSON.stringify({ name: '@webpresso/agent-kit' }))
    mkdirSync(join(repoRoot, 'catalog', 'agent', 'rules'), { recursive: true })
    mkdirSync(join(repoRoot, '.claude', 'rules'), { recursive: true })
    writeFileSync(join(repoRoot, 'catalog', 'agent', 'rules', 'rule-a.md'), '# Rule A\n')

    const targetPath = join(repoRoot, '.claude', 'rules', 'rule-a.md')
    symlinkSync(join('..', '..', '.agent', 'rules', 'rule-a.md'), targetPath)

    const results = scaffoldClaudeRules({ repoRoot, options: { overwrite: true } })

    expect(results).toEqual([{ targetPath, action: 'overwritten' }])
    expect(readlinkSync(targetPath)).toBe(
      join('..', '..', 'catalog', 'agent', 'rules', 'rule-a.md'),
    )
  })
})
