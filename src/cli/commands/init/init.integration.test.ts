import { existsSync, lstatSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { resolveCatalogDir, runInit } from './index.js'

// Tier-3 skill directories are populated incrementally as catalog content
// lands. Skip Tier-3 install assertions when the underlying catalog content
// isn't present yet — the install path itself is exercised, just not against
// a non-existent source dir.
const CATALOG_DIR = resolveCatalogDir()
const HAS_TANSTACK = existsSync(join(CATALOG_DIR, 'agent', 'skills', 'tanstack-query'))
const HAS_REACT_DOCTOR = existsSync(join(CATALOG_DIR, 'agent', 'skills', 'react-doctor'))

function makeTempRepo(): string {
  const dir = join(
    tmpdir(),
    `ak-init-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  )
  mkdirSync(dir, { recursive: true })
  // Simulate a git repo so findGitRoot succeeds.
  mkdirSync(join(dir, '.git'), { recursive: true })
  writeFileSync(
    join(dir, 'package.json'),
    JSON.stringify(
      {
        name: '@acme/demo',
        private: true,
        dependencies: { react: '^18.0.0', hono: '^4.0.0' },
        devDependencies: { vitest: '^2.0.0' },
      },
      null,
      2,
    ),
  )
  writeFileSync(
    join(dir, 'pnpm-workspace.yaml'),
    ['packages:', "  - 'apps/*'", "  - 'packages/*'", ''].join('\n'),
  )
  mkdirSync(join(dir, 'apps', 'api'), { recursive: true })
  writeFileSync(
    join(dir, 'apps', 'api', 'package.json'),
    JSON.stringify({ name: '@acme/api', version: '0.1.0' }),
  )
  mkdirSync(join(dir, 'packages', 'ui'), { recursive: true })
  writeFileSync(
    join(dir, 'packages', 'ui', 'package.json'),
    JSON.stringify({ name: '@acme/ui', version: '0.1.0' }),
  )
  return dir
}

describe('ak init end-to-end', () => {
  let repo: string

  beforeEach(() => {
    repo = makeTempRepo()
  })

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true })
  })

  it('fails with code 1 if no git root is found', async () => {
    const badDir = join(tmpdir(), `ak-init-nogit-${Date.now()}`)
    mkdirSync(badDir, { recursive: true })
    try {
      const code = await runInit({ cwd: badDir, yes: true })
      expect(code).toBe(1)
    } finally {
      rmSync(badDir, { recursive: true, force: true })
    }
  })

  it('scaffolds .agent/, docs/templates/, blueprints/, AGENTS.md, .agent-kitrc.json', async () => {
    const code = await runInit({ cwd: repo, yes: true })
    expect(code).toBe(0)

    // .agent structure
    expect(existsSync(join(repo, '.agent', 'commands', 'verify.md'))).toBe(true)
    expect(existsSync(join(repo, '.agent', 'skills', 'verify', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(repo, '.agent', 'skills', 'testing-philosophy', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(repo, '.agent', 'skills', 'systematic-debugging', 'SKILL.md'))).toBe(
      true,
    )
    expect(existsSync(join(repo, '.agent', 'workflows'))).toBe(true)
    expect(existsSync(join(repo, '.agent', 'rules'))).toBe(true)
    expect(existsSync(join(repo, '.agent', 'guides'))).toBe(true)

    // No tier-3 skills installed by default
    expect(existsSync(join(repo, '.agent', 'skills', 'tanstack-query'))).toBe(false)

    // monorepo-navigation is rendered from the template
    const navSkill = join(repo, '.agent', 'skills', 'monorepo-navigation', 'SKILL.md')
    expect(existsSync(navSkill)).toBe(true)
    const navBody = readFileSync(navSkill, 'utf8')
    expect(navBody).toContain('@acme/demo')
    expect(navBody).toContain('@acme/api')
    expect(navBody).toContain('@acme/ui')
    expect(navBody).not.toContain('{{PROJECT_NAME}}')

    // Docs
    expect(existsSync(join(repo, 'docs', 'templates', 'blueprint.md'))).toBe(true)
    expect(existsSync(join(repo, 'docs', 'templates', 'adr.md'))).toBe(true)

    // Blueprints
    expect(existsSync(join(repo, 'blueprints', 'planned', '.gitkeep'))).toBe(true)
    expect(existsSync(join(repo, 'blueprints', 'in-progress', '.gitkeep'))).toBe(true)
    expect(existsSync(join(repo, 'blueprints', 'README.md'))).toBe(true)

    // AGENTS.md
    const agents = readFileSync(join(repo, 'AGENTS.md'), 'utf8')
    expect(agents).toContain('@acme/api')
    expect(agents).toContain('React')
    expect(agents).toContain('.agent/planning/')

    // Config
    const rc = JSON.parse(readFileSync(join(repo, '.agent-kitrc.json'), 'utf8')) as {
      installed: { tier3Skills: string[] }
    }
    expect(rc.installed.tier3Skills).toEqual([])
  })

  it('installs Tier-3 skills when --with is passed', async () => {
    const code = await runInit({ cwd: repo, yes: true, with: 'tanstack-query,react-doctor' })
    expect(code).toBe(0)

    if (HAS_TANSTACK) {
      expect(existsSync(join(repo, '.agent', 'skills', 'tanstack-query', 'SKILL.md'))).toBe(true)
    }
    if (HAS_REACT_DOCTOR) {
      expect(existsSync(join(repo, '.agent', 'skills', 'react-doctor', 'SKILL.md'))).toBe(true)
    }

    const rc = JSON.parse(readFileSync(join(repo, '.agent-kitrc.json'), 'utf8')) as {
      installed: { tier3Skills: string[] }
    }
    expect(rc.installed.tier3Skills.toSorted()).toEqual(['react-doctor', 'tanstack-query'])
  })

  it('rejects unknown Tier-3 names with exit code 1', async () => {
    const code = await runInit({ cwd: repo, yes: true, with: 'not-a-real-skill' })
    expect(code).toBe(1)
  })

  it('dry-run writes nothing', async () => {
    const code = await runInit({ cwd: repo, yes: true, 'dry-run': true })
    expect(code).toBe(0)
    expect(existsSync(join(repo, '.agent'))).toBe(false)
    expect(existsSync(join(repo, 'AGENTS.md'))).toBe(false)
    expect(existsSync(join(repo, '.agent-kitrc.json'))).toBe(false)
  })

  it('preserves existing AGENTS.md with a .new sidecar by default', async () => {
    writeFileSync(join(repo, 'AGENTS.md'), '# Custom already-owned content')
    const code = await runInit({ cwd: repo, yes: true })
    expect(code).toBe(0)
    expect(readFileSync(join(repo, 'AGENTS.md'), 'utf8')).toBe('# Custom already-owned content')
    expect(existsSync(join(repo, 'AGENTS.md.new'))).toBe(true)
  })

  it('replaces existing AGENTS.md when --overwrite is passed', async () => {
    writeFileSync(join(repo, 'AGENTS.md'), '# old')
    const code = await runInit({ cwd: repo, yes: true, overwrite: true })
    expect(code).toBe(0)
    const body = readFileSync(join(repo, 'AGENTS.md'), 'utf8')
    expect(body).not.toBe('# old')
    expect(body).toContain('Operating Contract')
  })

  it('generates .agents/skills symlinks and Gemini TOML — does NOT write to primary IDEs', async () => {
    const code = await runInit({ cwd: repo, yes: true })
    expect(code).toBe(0)

    // Primary IDEs removed from symlinker — distributed via native channels.
    expect(existsSync(join(repo, '.claude'))).toBe(false)
    expect(existsSync(join(repo, '.cursor'))).toBe(false)
    expect(existsSync(join(repo, '.windsurf'))).toBe(false)
    expect(existsSync(join(repo, '.opencode'))).toBe(false)

    // Codex / Amp: per-skill symlinks in .agents/skills/
    const agentsVerifySkill = join(repo, '.agents', 'skills', 'verify')
    expect(lstatSync(agentsVerifySkill).isSymbolicLink()).toBe(true)

    // Gemini CLI: TOML transform
    const geminiToml = join(repo, '.gemini', 'commands', 'verify.toml')
    expect(existsSync(geminiToml)).toBe(true)
    expect(lstatSync(geminiToml).isFile()).toBe(true)

    expect(existsSync(join(repo, '.codex'))).toBe(false)
  })

  it('is idempotent: second run reports identical results', async () => {
    await runInit({ cwd: repo, yes: true, with: 'tanstack-query' })
    const code = await runInit({ cwd: repo, yes: true })
    expect(code).toBe(0)
    // Second run reads config and re-applies — config should still list the
    // Tier-3 skill the first run opted into.
    const rc = JSON.parse(readFileSync(join(repo, '.agent-kitrc.json'), 'utf8')) as {
      installed: { tier3Skills: string[] }
    }
    expect(rc.installed.tier3Skills).toContain('tanstack-query')
  })
})
