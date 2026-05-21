import {
  existsSync,
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const spawnSyncMock = vi.fn(() => ({
  status: 0,
  stdout: '',
  stderr: '',
  pid: 1,
  output: [],
  signal: null,
}))

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process')
  return {
    ...actual,
    spawnSync: (..._args: Parameters<typeof import('node:child_process').spawnSync>) =>
      spawnSyncMock(),
  }
})

import { resolveCatalogDir, runInit } from './index.js'

// Tier-3 skill directories are populated incrementally as catalog content
// lands. Skip Tier-3 install assertions when the underlying catalog content
// isn't present yet — the install path itself is exercised, just not against
// a non-existent source dir.
const CATALOG_DIR = resolveCatalogDir()
const PACKAGE_ROOT = dirname(CATALOG_DIR)
const HAS_TANSTACK = existsSync(join(CATALOG_DIR, 'agent', 'skills', 'tanstack-query'))
const HAS_REACT_DOCTOR = existsSync(join(CATALOG_DIR, 'agent', 'skills', 'react-doctor'))

/**
 * Walk the repo (skipping node_modules + .git) and return any `.new` sidecar
 * paths. Wave-3 expects ZERO sidecars from rule/skill surfaces.
 */
function findSidecars(root: string): string[] {
  const out: string[] = []
  const stack: string[] = [root]
  while (stack.length > 0) {
    const dir = stack.pop() as string
    let entries: string[]
    try {
      entries = readdirSync(dir)
    } catch {
      continue
    }
    for (const name of entries) {
      if (name === 'node_modules' || name === '.git') continue
      const abs = join(dir, name)
      let st: ReturnType<typeof lstatSync>
      try {
        st = lstatSync(abs)
      } catch {
        continue
      }
      if (st.isSymbolicLink()) continue
      if (st.isDirectory()) {
        stack.push(abs)
      } else if (st.isFile() && name.endsWith('.new')) {
        out.push(relative(root, abs))
      }
    }
  }
  return out.toSorted()
}

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
  mkdirSync(join(dir, 'node_modules', '@webpresso'), { recursive: true })
  symlinkSync(PACKAGE_ROOT, join(dir, 'node_modules', '@webpresso', 'agent-kit'))
  return dir
}

function markAsWebpressoRepo(repoRoot: string): void {
  mkdirSync(join(repoRoot, 'webpresso'), { recursive: true })
  writeFileSync(join(repoRoot, 'webpresso', 'config.yaml'), 'name: webpresso-monorepo\n')
}

describe('ak init end-to-end', () => {
  let repo: string
  let originalCodexHome: string | undefined
  let originalHome: string | undefined

  beforeEach(() => {
    repo = makeTempRepo()
    originalCodexHome = process.env.CODEX_HOME
    originalHome = process.env.HOME
    process.env.CODEX_HOME = join(repo, '.codex-home')
    process.env.HOME = join(repo, '.home')
    spawnSyncMock.mockClear()
  })

  afterEach(() => {
    if (originalCodexHome === undefined) {
      delete process.env.CODEX_HOME
    } else {
      process.env.CODEX_HOME = originalCodexHome
    }
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }
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

    // .agent structure (existsSync follows symlinks; .agent/skills entries
    // are now symlinks into the catalog populated by runUnifiedSync)
    expect(existsSync(join(repo, '.agent', 'commands', 'verify.md'))).toBe(true)
    expect(existsSync(join(repo, '.agent', 'skills', 'fix', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(repo, '.agent', 'skills', 'verify', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(repo, '.agent', 'skills', 'pll', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(repo, '.agents', 'skills', 'fix', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(repo, '.agents', 'skills', 'pll', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(repo, '.agent', 'skills', 'testing-philosophy', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(repo, '.agent', 'skills', 'systematic-debugging', 'SKILL.md'))).toBe(
      true,
    )
    expect(existsSync(join(repo, '.agent', 'workflows'))).toBe(true)
    expect(existsSync(join(repo, '.agent', 'rules'))).toBe(true)
    expect(existsSync(join(repo, '.agent', 'guides'))).toBe(true)

    // .agent/rules/ is populated as symlinks (one per catalog rule)
    const ruleEntries = readdirSync(join(repo, '.agent', 'rules'))
    expect(ruleEntries.some((n) => n.endsWith('.md'))).toBe(true)
    const sampleRule = ruleEntries.find((n) => n.endsWith('.md')) as string
    const sampleRuleAbs = join(repo, '.agent', 'rules', sampleRule)
    expect(lstatSync(sampleRuleAbs).isSymbolicLink()).toBe(true)

    // Wave-3: consumer-owned canonical dirs
    expect(existsSync(join(repo, 'agent-rules', '.gitkeep'))).toBe(true)
    expect(existsSync(join(repo, 'agent-rules', 'README.md'))).toBe(true)
    expect(existsSync(join(repo, 'agent-skills', '.gitkeep'))).toBe(true)
    expect(existsSync(join(repo, 'agent-skills', 'README.md'))).toBe(true)

    // Wave-3: zero `.new` sidecars under derived rule/skill surfaces
    const sidecars = findSidecars(repo)
    expect(sidecars).toEqual([])

    // No tier-3 skills installed by default — unified sync filters by allowedSkillSlugs
    expect(existsSync(join(repo, '.agent', 'skills', 'tanstack-query'))).toBe(false)

    // monorepo-navigation is rendered into the canonical consumer-owned skill
    // tree, then projected into generated host surfaces.
    const navSkill = join(repo, 'agent-skills', 'monorepo-navigation', 'SKILL.md')
    expect(existsSync(navSkill)).toBe(true)
    const navBody = readFileSync(navSkill, 'utf8')
    expect(navBody).toContain('@acme/demo')
    expect(navBody).toContain('@acme/api')
    expect(navBody).toContain('@acme/ui')
    expect(navBody).not.toContain('{{PROJECT_NAME}}')
    expect(existsSync(join(repo, '.agent', 'skills', 'monorepo-navigation', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(repo, '.agents', 'skills', 'monorepo-navigation', 'SKILL.md'))).toBe(
      true,
    )

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
    expect(existsSync(join(repo, '.agent', 'planning', 'contracts'))).toBe(false)
    expect(existsSync(join(repo, '.agent', 'planning', 'state'))).toBe(false)
    expect(existsSync(join(repo, '.agent', 'planning', 'notepad.md'))).toBe(false)
    expect(existsSync(join(repo, '.agent', 'planning', 'project-memory.json'))).toBe(false)
    expect(agents).toMatch(/Materialized by setup:[\s\S]*`\.agent\/planning\/plans\/`/)
    expect(agents).toMatch(
      /Generated on demand \(not created by setup\):[\s\S]*`\.agent\/planning\/contracts\/`[\s\S]*`\.agent\/planning\/state\/`[\s\S]*`\.agent\/planning\/notepad\.md`[\s\S]*`\.agent\/planning\/project-memory\.json`/,
    )
    expect(agents).toContain('pnpm install && pnpm setup:agent')
    expect(agents).not.toContain('ak symlink sync')

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
    expect([...rc.installed.tier3Skills].sort()).toEqual(['react-doctor', 'tanstack-query'])
  })

  it('persists webpresso/blueprints in config and scaffolds that layout for webpresso repos', async () => {
    markAsWebpressoRepo(repo)

    const code = await runInit({ cwd: repo, yes: true })
    expect(code).toBe(0)

    expect(existsSync(join(repo, 'webpresso', 'blueprints', 'planned', '.gitkeep'))).toBe(true)
    expect(existsSync(join(repo, 'webpresso', 'blueprints', 'README.md'))).toBe(true)
    expect(existsSync(join(repo, 'blueprints'))).toBe(false)

    const rc = JSON.parse(readFileSync(join(repo, '.agent-kitrc.json'), 'utf8')) as {
      blueprintsDir?: string
      installed: { tier3Skills: string[] }
    }
    expect(rc.blueprintsDir).toBe('webpresso/blueprints')
    expect(rc.installed.tier3Skills).toEqual([])

    const agents = readFileSync(join(repo, 'AGENTS.md'), 'utf8')
    expect(agents).toContain('[`webpresso/blueprints/`](./webpresso/blueprints/)')
    expect(agents).toContain('`webpresso/blueprints/` (`planned/`, `in-progress/`, `completed/`)')
    expect(agents).not.toContain('./blueprints/')
    expect(agents).not.toContain('{{BLUEPRINTS_DIR}}')
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
    expect(existsSync(join(repo, '.claude', 'hooks'))).toBe(false)
  })

  it('falls back to the currently executing package when the consumer package is not installed yet', async () => {
    rmSync(join(repo, 'node_modules', '@webpresso', 'agent-kit'), { force: true })

    const code = await runInit({ cwd: repo, yes: true })

    expect(code).toBe(0)
  })

  it('preserves existing AGENTS.md with a .new sidecar by default', async () => {
    writeFileSync(join(repo, 'AGENTS.md'), '# Custom already-owned content')
    const code = await runInit({ cwd: repo, yes: true })
    expect(code).toBe(0)
    expect(readFileSync(join(repo, 'AGENTS.md'), 'utf8')).toBe('# Custom already-owned content')
    expect(existsSync(join(repo, 'AGENTS.md.new'))).toBe(true)
  })

  it('refreshes managed AGENTS blocks in place while preserving user-owned blocks', async () => {
    writeFileSync(
      join(repo, 'AGENTS.md'),
      [
        '<!-- >>> managed by @webpresso/agent-kit (operating-contract) -->',
        '# Old heading',
        '<!-- <<< managed by @webpresso/agent-kit (operating-contract) -->',
        '<!-- >>> user-owned (repo-customizations) -->',
        'Keep this customization',
        '<!-- <<< user-owned (repo-customizations) -->',
        '<!-- >>> managed by @webpresso/agent-kit (planning-and-release) -->',
        'Old planning block',
        '<!-- <<< managed by @webpresso/agent-kit (planning-and-release) -->',
        '<!-- >>> user-owned (escalation-map) -->',
        'Keep this escalation map',
        '<!-- <<< user-owned (escalation-map) -->',
        '',
      ].join('\n'),
    )

    const code = await runInit({ cwd: repo, yes: true })

    expect(code).toBe(0)
    const body = readFileSync(join(repo, 'AGENTS.md'), 'utf8')
    expect(body).toContain('# Operating Contract')
    expect(body).toContain('Keep this customization')
    expect(body).toContain('Keep this escalation map')
    expect(body).not.toContain('# Old heading')
    expect(body).not.toContain('Old planning block')
    expect(existsSync(join(repo, 'AGENTS.md.new'))).toBe(false)
  })

  it('replaces existing AGENTS.md when --overwrite is passed', async () => {
    writeFileSync(join(repo, 'AGENTS.md'), '# old')
    const code = await runInit({ cwd: repo, yes: true, overwrite: true })
    expect(code).toBe(0)
    const body = readFileSync(join(repo, 'AGENTS.md'), 'utf8')
    expect(body).not.toBe('# old')
    expect(body).toContain('Operating Contract')
  })

  it('generates portable .agents/skills symlinks and host skill surfaces', async () => {
    const code = await runInit({ cwd: repo, yes: true })
    expect(code).toBe(0)

    // Wave-3: unified sync now populates per-IDE rule/skill surfaces.
    // Commands surfaces (`.claude/commands`) remain unwritten — covered by
    // the Claude Code plugin, not by ak setup.
    expect(existsSync(join(repo, '.claude', 'commands'))).toBe(false)
    // .claude/skills now hosts symlinked rules + skills via unified sync
    expect(existsSync(join(repo, '.claude', 'skills'))).toBe(true)
    // .cursor/rules now hosts copied rules (.mdc)
    expect(existsSync(join(repo, '.cursor', 'rules'))).toBe(true)
    // .windsurf/skills now hosts copied skills
    expect(existsSync(join(repo, '.windsurf', 'skills'))).toBe(true)
    // opencode.json is gated behind `--with context-mode` per the 2026-05-15
    // opt-in migration (docs/migration/context-mode-opt-in.md). A bare
    // `runInit` must NOT write it; if this flips, context-mode silently
    // re-defaulted.
    expect(existsSync(join(repo, 'opencode.json'))).toBe(false)
    // agent-hooks scaffolder writes hook config
    expect(existsSync(join(repo, '.claude', 'settings.json'))).toBe(true)
    expect(existsSync(join(repo, '.codex', 'hooks.json'))).toBe(true)
    expect(existsSync(join(repo, '.claude', 'agents', 'code-reviewer.md'))).toBe(true)
    expect(existsSync(join(repo, '.claude', 'agents', 'security-auditor.md'))).toBe(true)
    expect(existsSync(join(repo, '.claude', 'agents', 'doc-writer.md'))).toBe(true)
    expect(existsSync(join(repo, '.claude', 'agents', 'explorer.md'))).toBe(true)
    const claudeSettings = JSON.parse(
      readFileSync(join(repo, '.claude', 'settings.json'), 'utf8'),
    ) as {
      hooks: {
        Stop: Array<{ hooks: Array<{ command: string }> }>
      }
    }
    const stopCommands = claudeSettings.hooks.Stop.flatMap((group) =>
      group.hooks.map((hook) => hook.command),
    )
    expect(stopCommands.some((command) => command.includes('ak-stop-qa'))).toBe(true)
    expect(
      stopCommands.some((command) =>
        command.includes('"$CLAUDE_PROJECT_DIR/node_modules/.bin/ak" audit agents'),
      ),
    ).toBe(true)
    expect(stopCommands.some((command) => command.includes('# from-skill: verify'))).toBe(true)

    // Codex: skill folders are symlinked because official docs guarantee
    // symlinked skill folder discovery.
    const agentsVerifySkill = join(repo, '.agents', 'skills', 'verify')
    expect(statSync(agentsVerifySkill).isDirectory()).toBe(true)
    expect(lstatSync(agentsVerifySkill).isSymbolicLink()).toBe(true)
    expect(existsSync(join(agentsVerifySkill, 'SKILL.md'))).toBe(true)

    // agent-hooks scaffolder writes .codex/hooks.json
    expect(existsSync(join(repo, '.codex', 'hooks.json'))).toBe(true)
  })

  it('is idempotent: second run reports identical results', async () => {
    await runInit({ cwd: repo, yes: true, with: 'tanstack-query' })
    const firstConfig = readFileSync(join(repo, '.agent-kitrc.json'), 'utf8')
    const code = await runInit({ cwd: repo, yes: true })
    expect(code).toBe(0)
    const secondConfig = readFileSync(join(repo, '.agent-kitrc.json'), 'utf8')
    expect(secondConfig).toBe(firstConfig)
    // Second run reads config and re-applies — config should still list the
    // Tier-3 skill the first run opted into.
    const rc = JSON.parse(secondConfig) as {
      installed: { tier3Skills: string[] }
    }
    expect(rc.installed.tier3Skills).toContain('tanstack-query')

    // Wave-3: second invocation produces no `.new` sidecars under
    // any rule/skill surface.
    expect(findSidecars(repo)).toEqual([])
  })
})

describe('DX output: lane framing and next-steps block', () => {
  let repo: string
  let originalCodexHome: string | undefined
  let originalHome: string | undefined
  let logLines: string[]
  let originalLog: typeof console.log

  beforeEach(() => {
    repo = makeTempRepo()
    originalCodexHome = process.env.CODEX_HOME
    originalHome = process.env.HOME
    process.env.CODEX_HOME = join(repo, '.codex-home')
    process.env.HOME = join(repo, '.home')
    spawnSyncMock.mockClear()
    logLines = []
    originalLog = console.log
    console.log = (...args: unknown[]): void => {
      logLines.push(args.map(String).join(' '))
    }
  })

  afterEach(() => {
    console.log = originalLog
    if (originalCodexHome === undefined) {
      delete process.env.CODEX_HOME
    } else {
      process.env.CODEX_HOME = originalCodexHome
    }
    if (originalHome === undefined) {
      delete process.env.HOME
    } else {
      process.env.HOME = originalHome
    }
    rmSync(repo, { recursive: true, force: true })
  })

  it('prints lane framing after a successful run', async () => {
    await runInit({ cwd: repo, yes: true })
    const allOutput = logLines.join('\n')
    expect(allOutput).toContain('ak_*')
    expect(allOutput).toContain('ctx_*')
    expect(allOutput).toContain('rtk')
    expect(allOutput).toContain('gstack')
  })

  it('prints next-steps block (ak blueprint new, ak gain) on non-dry-run', async () => {
    await runInit({ cwd: repo, yes: true })
    const allOutput = logLines.join('\n')
    expect(allOutput).toContain('ak blueprint new')
    expect(allOutput).toContain('ak gain')
  })

  it('prints Claude plugin auto-enable status on non-dry-run', async () => {
    await runInit({ cwd: repo, yes: true })
    const allOutput = logLines.join('\n')
    expect(allOutput).toContain('claude plugin:')
    expect(allOutput).toContain('agent-kit@agent-kit')
  })

  it('omits next-steps block in --dry-run mode', async () => {
    await runInit({ cwd: repo, yes: true, 'dry-run': true })
    const allOutput = logLines.join('\n')
    expect(allOutput).not.toContain('ak blueprint new')
    expect(allOutput).not.toContain('ak gain')
  })

  it('lane framing is present even in --dry-run mode', async () => {
    await runInit({ cwd: repo, yes: true, 'dry-run': true })
    const allOutput = logLines.join('\n')
    expect(allOutput).toContain('ak_*')
    expect(allOutput).toContain('ctx_*')
  })
})

describe('warnIfNonLocalCli (DX2)', () => {
  let repo: string
  let originalError: typeof console.error
  let captured: string[]

  beforeEach(() => {
    repo = join(tmpdir(), `ak-warn-cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
    mkdirSync(repo, { recursive: true })
    writeFileSync(join(repo, 'package.json'), JSON.stringify({ name: '@acme/demo', private: true }))
    captured = []
    originalError = console.error
    console.error = (msg: unknown): void => {
      captured.push(String(msg))
    }
  })

  afterEach(() => {
    console.error = originalError
    rmSync(repo, { recursive: true, force: true })
  })

  it('warns when CLI lives outside <repoRoot>/node_modules/', async () => {
    const { warnIfNonLocalCli } = await import('./detect-consumer.js')
    // Simulate a global CLI: file:// URL pointing at /opt/homebrew/lib/...
    warnIfNonLocalCli(repo, 'file:///opt/homebrew/lib/agent-kit/dist/cli/cli.js')

    expect(
      captured.some(
        (line) =>
          line.includes('warning: ak running from a non-local install') &&
          line.includes('/opt/homebrew/lib/agent-kit/dist/cli/cli.js'),
      ),
    ).toBe(true)
  })

  it('stays silent when CLI lives under <repoRoot>/node_modules/', async () => {
    const { warnIfNonLocalCli } = await import('./detect-consumer.js')
    const cliFile = join(repo, 'node_modules', '@webpresso', 'agent-kit', 'dist', 'cli', 'cli.js')
    mkdirSync(dirname(cliFile), { recursive: true })
    writeFileSync(join(repo, 'node_modules', '@webpresso', 'agent-kit', 'package.json'), '{}')
    writeFileSync(cliFile, '// stub')

    warnIfNonLocalCli(repo, `file://${cliFile}`)

    expect(captured).toEqual([])
  })

  it('stays silent when CLI lives under pnpm local install roots', async () => {
    const { warnIfNonLocalCli } = await import('./detect-consumer.js')
    const cliFile = join(
      repo,
      'node_modules',
      '.pnpm',
      '@webpresso+agent-kit@1.2.3',
      'node_modules',
      '@webpresso',
      'agent-kit',
      'dist',
      'cli',
      'cli.js',
    )
    mkdirSync(dirname(cliFile), { recursive: true })
    writeFileSync(
      join(
        repo,
        'node_modules',
        '.pnpm',
        '@webpresso+agent-kit@1.2.3',
        'node_modules',
        '@webpresso',
        'agent-kit',
        'package.json',
      ),
      '{}',
    )
    writeFileSync(cliFile, '// stub')

    warnIfNonLocalCli(repo, `file://${cliFile}`)

    expect(captured).toEqual([])
  })

  it('stays silent for repo-local symlink/dev-link installs', async () => {
    const { warnIfNonLocalCli } = await import('./detect-consumer.js')
    const linkedRoot = join(
      tmpdir(),
      `ak-linked-root-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    )
    const localRoot = join(repo, 'node_modules', '@webpresso', 'agent-kit')
    const cliFile = join(linkedRoot, 'dist', 'cli', 'cli.js')

    mkdirSync(dirname(cliFile), { recursive: true })
    writeFileSync(join(linkedRoot, 'package.json'), '{}')
    writeFileSync(cliFile, '// stub')
    mkdirSync(dirname(localRoot), { recursive: true })
    symlinkSync(linkedRoot, localRoot, 'dir')

    warnIfNonLocalCli(repo, `file://${cliFile}`)

    expect(captured).toEqual([])
    rmSync(linkedRoot, { recursive: true, force: true })
  })

  it('stays silent when .agent-kitrc.json opts into globalInstall mode', async () => {
    const { warnIfNonLocalCli } = await import('./detect-consumer.js')
    writeFileSync(
      join(repo, '.agent-kitrc.json'),
      JSON.stringify({
        version: '1',
        installed: { tier3Skills: [] },
        rules: { overrides: [] },
        scripts: {},
        durablePlanningRoot: '.agent/planning/',
        globalInstall: true,
      }),
    )

    warnIfNonLocalCli(repo, 'file:///opt/homebrew/lib/agent-kit/dist/cli/cli.js')

    expect(captured).toEqual([])
  })

  it('warns to use the repo-local CLI when the repo already pins agent-kit', async () => {
    const { warnIfNonLocalCli } = await import('./detect-consumer.js')
    writeFileSync(
      join(repo, 'package.json'),
      JSON.stringify({
        name: '@acme/demo',
        private: true,
        devDependencies: { '@webpresso/agent-kit': '^1.2.3' },
      }),
    )

    warnIfNonLocalCli(repo, 'file:///opt/homebrew/lib/agent-kit/dist/cli/cli.js')

    expect(
      captured.some(
        (line) =>
          line.includes('warning: ak running from a non-local install') &&
          line.includes('This repo already pins `@webpresso/agent-kit`') &&
          line.includes('pnpm run setup:agent') &&
          line.includes('pnpm exec ak setup'),
      ),
    ).toBe(true)
  })

  it('self-mode short-circuits (consumer IS @webpresso/agent-kit)', async () => {
    writeFileSync(
      join(repo, 'package.json'),
      JSON.stringify({ name: '@webpresso/agent-kit', private: true }),
    )
    const { warnIfNonLocalCli } = await import('./detect-consumer.js')

    // Even with a clearly-non-local CLI path, self-mode skips the warning.
    warnIfNonLocalCli(repo, 'file:///opt/homebrew/lib/agent-kit/dist/cli/cli.js')

    expect(captured).toEqual([])
  })
})
