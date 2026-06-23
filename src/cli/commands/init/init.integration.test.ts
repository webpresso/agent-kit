import {
  chmodSync,
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
import { EventEmitter } from 'node:events'
import { PassThrough } from 'node:stream'
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
const spawnMock = vi.fn()

class FakeAsyncChild extends EventEmitter {
  readonly stdout = new PassThrough()
  readonly stderr = new PassThrough()
  readonly pid = 1234
  readonly kill = vi.fn(() => true)

  constructor() {
    super()
    queueMicrotask(() => {
      this.stdout.end()
      this.stderr.end()
      this.emit('close', 0, null)
    })
  }
}

vi.mock('node:child_process', async () => {
  const actual = await vi.importActual<typeof import('node:child_process')>('node:child_process')
  return {
    ...actual,
    spawn: (..._args: Parameters<typeof import('node:child_process').spawn>) => spawnMock(),
    spawnSync: (..._args: Parameters<typeof import('node:child_process').spawnSync>) =>
      spawnSyncMock(),
  }
})

import { resolveCatalogDir, runInit } from './index.js'
import { scaffoldAgent } from './scaffold-agent.js'
import { writeHooksManifest } from './scaffolders/agent-hooks/manifest.js'

// Tier-3 skill directories are populated incrementally as catalog content
// lands. Skip Tier-3 install assertions when the underlying catalog content
// isn't present yet — the install path itself is exercised, just not against
// a non-existent source dir.
const CATALOG_DIR = resolveCatalogDir()
const PACKAGE_ROOT = dirname(CATALOG_DIR)
const HAS_TANSTACK = existsSync(join(CATALOG_DIR, 'agent', 'skills', 'tanstack-query'))
const HAS_REACT_DOCTOR = existsSync(join(CATALOG_DIR, 'agent', 'skills', 'react-doctor'))

/**
 * Walk the repo (skipping node_modules + .git) and return any generated
 * companion files. Normal setup should not create these.
 */
function findCompanionFiles(root: string): string[] {
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
    `wp-init-smoke-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
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
        devDependencies: {
          vitest: '^2.0.0',
          '@webpresso/agent-config': '^0.1.5',
        },
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

function rerunGeneratedAgentSurface(repoRoot: string): void {
  scaffoldAgent({
    catalogDir: CATALOG_DIR,
    repoRoot,
    options: { overwrite: false, dryRun: false },
  })
}

function readJsonFile<T>(path: string): T {
  return JSON.parse(readFileSync(path, 'utf8')) as T
}

describe('wp init end-to-end', { timeout: 40_000 }, () => {
  let repo: string
  let consoleErrorSpy: ReturnType<typeof vi.spyOn> | undefined
  let consoleLogSpy: ReturnType<typeof vi.spyOn> | undefined
  let consoleWarnSpy: ReturnType<typeof vi.spyOn> | undefined
  let stdoutWriteSpy: ReturnType<typeof vi.spyOn> | undefined
  let originalCodexHome: string | undefined
  let originalHome: string | undefined
  let originalCi: string | undefined
  let originalPath: string | undefined

  beforeEach(() => {
    repo = makeTempRepo()
    originalCodexHome = process.env.CODEX_HOME
    originalHome = process.env.HOME
    originalCi = process.env.CI
    originalPath = process.env.PATH
    process.env.CODEX_HOME = join(repo, '.codex-home')
    process.env.HOME = join(repo, '.home')
    // These end-to-end tests exercise the default workstation lane. GitHub
    // Actions exports CI=true, which intentionally skips optional workstation
    // scaffolders, so pin the environment to the same non-CI contract the tests
    // assert while restoring the caller's value after each test.
    delete process.env.CI
    const fakeBinDir = join(repo, 'bin')
    const fakeOmx = join(fakeBinDir, 'omx')
    mkdirSync(fakeBinDir, { recursive: true })
    writeFileSync(fakeOmx, '#!/usr/bin/env sh\necho 1.2.3\n', 'utf8')
    chmodSync(fakeOmx, 0o755)
    // Command detection now uses a real PATH scan (#runtime/command-exists), not the
    // mocked `which` spawnSync, so stage a real `claude` on PATH for the flows that
    // gate on it (Claude-plugin install, OMC). `codex` is intentionally NOT staged:
    // no assertion here needs codex detection, and the async `spawn` mock does not
    // model codex-plugin's install handshake (it would hang). The real codex
    // app-server boundary is deadline-guarded, so this is a test-mock gap, not a
    // product hang.
    const fakeClaude = join(fakeBinDir, 'claude')
    writeFileSync(fakeClaude, '#!/usr/bin/env sh\nexit 0\n', 'utf8')
    chmodSync(fakeClaude, 0o755)
    process.env.PATH = `${fakeBinDir}:${originalPath ?? ''}`
    spawnSyncMock.mockClear()
    spawnMock.mockClear()
    spawnMock.mockImplementation(() => new FakeAsyncChild())
    consoleLogSpy = vi.spyOn(console, 'log').mockImplementation(() => {})
    consoleWarnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    stdoutWriteSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
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
    if (originalCi === undefined) {
      delete process.env.CI
    } else {
      process.env.CI = originalCi
    }
    if (originalPath === undefined) {
      delete process.env.PATH
    } else {
      process.env.PATH = originalPath
    }
    consoleLogSpy?.mockRestore()
    consoleWarnSpy?.mockRestore()
    consoleErrorSpy?.mockRestore()
    stdoutWriteSpy?.mockRestore()
    rmSync(repo, { recursive: true, force: true })
  })

  it('falls back to user-only setup outside a git repo and configures Codex MCP', async () => {
    const badDir = join(tmpdir(), `wp-init-nogit-${Date.now()}`)
    mkdirSync(badDir, { recursive: true })
    try {
      const code = await runInit({ cwd: badDir, yes: true, host: 'none' })

      expect(code).toBe(0)
      expect(consoleWarnSpy).toHaveBeenCalledWith(
        expect.stringContaining('is not inside a git repo; running user-only setup'),
      )
      expect(readFileSync(join(repo, '.codex-home', 'config.toml'), 'utf8')).toContain(
        '[mcp_servers.webpresso]',
      )
      expect(existsSync(join(badDir, '.webpressorc.json'))).toBe(false)
      expect(existsSync(join(badDir, '.agent'))).toBe(false)
      expect(existsSync(join(badDir, 'AGENTS.md'))).toBe(false)
    } finally {
      rmSync(badDir, { recursive: true, force: true })
    }
  })

  it('does not synthesize global Codex OMX managed hook wrappers from a non-git directory', async () => {
    const badDir = join(tmpdir(), `wp-init-nogit-omx-${Date.now()}`)
    mkdirSync(badDir, { recursive: true })
    mkdirSync(join(repo, '.codex-home'), { recursive: true })
    writeFileSync(
      join(repo, '.codex-home', 'hooks.json'),
      JSON.stringify(
        {
          hooks: {
            Stop: [{ hooks: [{ type: 'command', command: 'node /tmp/external-hook.js' }] }],
          },
        },
        null,
        2,
      ),
    )

    try {
      const code = await runInit({ cwd: badDir, yes: true, with: 'omx', host: 'none' })

      expect(code).toBe(0)
      const hooks = readFileSync(join(repo, '.codex-home', 'hooks.json'), 'utf8')
      expect(hooks).toContain('node /tmp/external-hook.js')
      expect(hooks).not.toContain('managed-hooks/')
      expect(existsSync(join(repo, '.codex-home', 'managed-hooks'))).toBe(false)
      expect(existsSync(join(badDir, '.webpressorc.json'))).toBe(false)
      expect(existsSync(join(badDir, '.agent'))).toBe(false)
    } finally {
      rmSync(badDir, { recursive: true, force: true })
    }
  })

  it.each([
    ['--project-init', { projectInit: true }],
    ['--restore-hooks', { restoreHooks: true }],
    ['--disable-hooks', { disableHooks: 'codex' }],
  ] as const)('rejects %s outside a git repo as project-only setup', async (_label, flags) => {
    const badDir = join(tmpdir(), `wp-init-nogit-project-only-${Date.now()}`)
    mkdirSync(badDir, { recursive: true })
    try {
      const code = await runInit({ cwd: badDir, yes: true, ...flags })

      expect(code).toBe(1)
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('requires a git working tree'),
      )
      expect(existsSync(join(badDir, '.webpressorc.json'))).toBe(false)
      expect(existsSync(join(badDir, '.agent'))).toBe(false)
    } finally {
      rmSync(badDir, { recursive: true, force: true })
    }
  })

  it("refuses to scaffold agent-kit's own template-source repo and writes nothing", async () => {
    // Re-identify the temp repo as agent-kit's own package — the source tree
    // for every agent-surface template. Setup must refuse rather than overwrite.
    writeFileSync(
      join(repo, 'package.json'),
      JSON.stringify({ name: '@webpresso/agent-kit', private: true }, null, 2),
    )

    const code = await runInit({ cwd: repo, yes: true })

    expect(code).toBe(1)
    expect(consoleErrorSpy).toHaveBeenCalledWith(expect.stringContaining('refusing to scaffold'))
    // Writes nothing: no agent surface, no rc file, no AGENTS.md.
    expect(existsSync(join(repo, '.webpressorc.json'))).toBe(false)
    expect(existsSync(join(repo, '.agent'))).toBe(false)
    expect(existsSync(join(repo, 'AGENTS.md'))).toBe(false)
  })

  it('proceeds past the self-repo guard when --source-maintenance is set', async () => {
    writeFileSync(
      join(repo, 'package.json'),
      JSON.stringify(
        { name: '@webpresso/agent-kit', private: true, devDependencies: { vitest: '^2.0.0' } },
        null,
        2,
      ),
    )

    const code = await runInit({ cwd: repo, yes: true, sourceMaintenance: true })

    expect(code).toBe(0)
    // Proceeding past the guard scaffolds the workspace config marker.
    expect(existsSync(join(repo, '.webpressorc.json'))).toBe(true)
  })

  it('migrates legacy .agent-kitrc.json state into .webpressorc.json on setup', async () => {
    writeFileSync(
      join(repo, '.agent-kitrc.json'),
      JSON.stringify(
        {
          version: '1',
          installed: { tier3Skills: ['base-kit', 'tanstack-query'] },
          hosts: {
            selected: ['codex'],
            requiredCapabilities: ['verify'],
          },
          rules: { overrides: ['repo-restrictions'] },
          scripts: {},
          durablePlanningRoot: '.agent/planning/',
          blueprintsDir: 'plans',
        },
        null,
        2,
      ),
    )

    const code = await runInit({ cwd: repo, yes: true })

    expect(code).toBe(0)
    const rc = JSON.parse(readFileSync(join(repo, '.webpressorc.json'), 'utf8')) as {
      installed: { tier3Skills: string[] }
      hosts?: { selected?: string[] }
      rules?: { overrides?: string[] }
      blueprintsDir?: string
    }
    expect(rc.installed.tier3Skills).toEqual(['base-kit', 'tanstack-query'])
    expect(rc.hosts?.selected).toEqual(['codex'])
    expect(rc.rules?.overrides).toEqual(['repo-restrictions'])
    expect(rc.blueprintsDir).toBe('plans')
  })

  it('supports a no-host fresh bootstrap with explicit degraded reporting', async () => {
    const code = await runInit({ cwd: repo, yes: true, host: 'none' })

    expect(code).toBe(0)
    expect(consoleLogSpy).toHaveBeenCalledWith(expect.stringContaining('repo quality scaffold:'))
    expect(consoleLogSpy).toHaveBeenCalledWith('  hosts: - skipped (--host none)')
    const rc = JSON.parse(readFileSync(join(repo, '.webpressorc.json'), 'utf8')) as {
      hosts?: { selected?: string[] }
    }
    expect(rc.hosts?.selected).toEqual([])
  })

  it('scaffolds .agent/, docs/templates/, blueprints/, AGENTS.md, .webpressorc.json', async () => {
    const code = await runInit({ cwd: repo, yes: true })
    expect(code).toBe(0)

    // .agent structure (existsSync follows symlinks; .agent/skills entries
    // are now symlinks into the catalog populated by runUnifiedSync)
    expect(existsSync(join(repo, '.agent', 'commands', 'verify.md'))).toBe(true)
    expect(existsSync(join(repo, '.agent', 'skills', 'fix', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(repo, '.agent', 'skills', 'verify', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(repo, '.agent', 'skills', 'pll', 'SKILL.md'))).toBe(true)
    // OpenCode (a selected dir-host) receives skills at its primary .opencode/skills
    // root; Claude/Codex get them from their plugins, so no .claude/.agents skill dirs.
    expect(existsSync(join(repo, '.opencode', 'skills', 'fix', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(repo, '.opencode', 'skills', 'pll', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(repo, '.agents', 'skills', 'fix', 'SKILL.md'))).toBe(false)
    expect(existsSync(join(repo, '.claude', 'skills', 'fix', 'SKILL.md'))).toBe(false)
    expect(existsSync(join(repo, '.agent', 'skills', 'testing-philosophy', 'SKILL.md'))).toBe(true)
    expect(existsSync(join(repo, '.agent', 'skills', 'systematic-debugging', 'SKILL.md'))).toBe(
      false,
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

    // Wave-3: zero generated companion files under derived rule/skill surfaces
    const companionFiles = findCompanionFiles(repo)
    expect(companionFiles).toEqual([])

    // Only base-kit is installed by default; other opt-in skills remain opt-in.
    expect(existsSync(join(repo, '.agent', 'skills', 'tanstack-query'))).toBe(false)

    // monorepo-navigation is rendered into the canonical consumer-owned skill
    // tree, but stays out of generated host-visible surfaces by default.
    const navSkill = join(repo, 'agent-skills', 'monorepo-navigation', 'SKILL.md')
    expect(existsSync(navSkill)).toBe(true)
    const navBody = readFileSync(navSkill, 'utf8')
    expect(navBody).toContain('@acme/demo')
    expect(navBody).toContain('@acme/api')
    expect(navBody).toContain('@acme/ui')
    expect(navBody).not.toContain('{{PROJECT_NAME}}')
    expect(existsSync(join(repo, '.agent', 'skills', 'monorepo-navigation', 'SKILL.md'))).toBe(
      false,
    )
    expect(existsSync(join(repo, '.agents', 'skills', 'monorepo-navigation', 'SKILL.md'))).toBe(
      false,
    )

    // Docs
    expect(existsSync(join(repo, 'docs', 'templates', 'blueprint.md'))).toBe(true)
    expect(existsSync(join(repo, 'docs', 'templates', 'adr.md'))).toBe(true)

    // Default base-kit quality scaffold
    expect(existsSync(join(repo, 'tsconfig.json'))).toBe(true)
    expect(existsSync(join(repo, 'vitest.config.ts'))).toBe(true)
    // Tier-1 DRY: oxlint.config.ts is intentionally not scaffolded; `wp lint`
    // injects agent-kit's shared --config.
    expect(existsSync(join(repo, 'oxlint.config.ts'))).toBe(false)
    expect(existsSync(join(repo, 'stryker.config.ts'))).toBe(true)
    expect(readFileSync(join(repo, 'stryker.config.ts'), 'utf8')).not.toContain('mutate:')
    expect(existsSync(join(repo, 'playwright.config.ts'))).toBe(true)
    expect(existsSync(join(repo, 'src', 'quality-sample.ts'))).toBe(true)
    expect(existsSync(join(repo, 'src', 'quality-sample.test.ts'))).toBe(true)
    expect(existsSync(join(repo, 'e2e', 'fixtures', 'smoke.html'))).toBe(true)
    expect(existsSync(join(repo, 'e2e', 'smoke.spec.ts'))).toBe(true)
    const tsconfigJson = JSON.parse(readFileSync(join(repo, 'tsconfig.json'), 'utf8')) as {
      extends?: string
    }
    expect(tsconfigJson.extends).toBe('@webpresso/agent-config/tsconfig/base.json')
    const packageJson = JSON.parse(readFileSync(join(repo, 'package.json'), 'utf8')) as {
      scripts: Record<string, string>
      devDependencies: Record<string, string>
    }
    expect(packageJson.scripts.lint).toBe('wp lint --file src --file e2e --file *.config.ts')
    expect(packageJson.scripts.typecheck).toBe('wp typecheck')
    expect(packageJson.scripts.test).toBe('wp test --file vitest.config.ts')
    expect(packageJson.scripts.mutation).toBe('wp test --mutation')
    expect(packageJson.scripts.e2e).toBe('wp e2e --config playwright.config.ts')
    expect(packageJson.devDependencies['@webpresso/agent-kit']).toBeUndefined()
    expect(packageJson.devDependencies['@webpresso/agent-config']).toMatch(/^\^\d+\.\d+\.\d+/u)
    expect(packageJson.devDependencies['@stryker-mutator/typescript-checker']).toBe('latest')

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
    expect(agents).toMatch(
      /Materialized by setup:[\s\S]*blueprint lifecycle directories under `blueprints\/`[\s\S]*Put blueprint-owned PRDs and test specs under `blueprints\/`/,
    )
    expect(agents).toMatch(
      /Generated on demand \(not created by setup\):[\s\S]*`\.agent\/planning\/contracts\/`[\s\S]*`\.agent\/planning\/state\/`[\s\S]*`\.agent\/planning\/notepad\.md`[\s\S]*`\.agent\/planning\/project-memory\.json`/,
    )
    expect(agents).toContain('vp install && vp run setup:agent')
    expect(agents).not.toContain('wp symlink sync')

    // Config
    const rc = JSON.parse(readFileSync(join(repo, '.webpressorc.json'), 'utf8')) as {
      installed: { tier3Skills: string[] }
    }
    expect(rc.installed.tier3Skills).toEqual(['base-kit'])
  })

  it('installs opt-in skills when --with is passed', async () => {
    const code = await runInit({
      cwd: repo,
      yes: true,
      with: 'tanstack-query,react-doctor,systematic-debugging,monorepo-navigation',
    })
    expect(code).toBe(0)

    if (HAS_TANSTACK) {
      expect(existsSync(join(repo, '.agent', 'skills', 'tanstack-query', 'SKILL.md'))).toBe(true)
    }
    if (HAS_REACT_DOCTOR) {
      expect(existsSync(join(repo, '.agent', 'skills', 'react-doctor', 'SKILL.md'))).toBe(true)
    }
    expect(existsSync(join(repo, '.agent', 'skills', 'systematic-debugging', 'SKILL.md'))).toBe(
      true,
    )
    expect(existsSync(join(repo, '.agent', 'skills', 'monorepo-navigation', 'SKILL.md'))).toBe(true)

    const rc = JSON.parse(readFileSync(join(repo, '.webpressorc.json'), 'utf8')) as {
      installed: { tier3Skills: string[] }
    }
    expect([...rc.installed.tier3Skills].sort()).toEqual([
      'base-kit',
      'monorepo-navigation',
      'react-doctor',
      'systematic-debugging',
      'tanstack-query',
    ])
  })

  it('prints runtime-owned migration guidance without blanket dependency removal advice', async () => {
    writeFileSync(
      join(repo, 'package.json'),
      JSON.stringify(
        {
          name: '@acme/demo',
          private: true,
          dependencies: { react: '^18.0.0', hono: '^4.0.0' },
          devDependencies: {
            vitest: '^2.0.0',
            '@webpresso/agent-config': '^0.1.5',
            '@playwright/test': '^1.55.0',
            oxlint: '^1.0.0',
            oxfmt: '^1.0.0',
          },
        },
        null,
        2,
      ),
    )

    const code = await runInit({ cwd: repo, yes: true })
    expect(code).toBe(0)

    const logOutput = consoleLogSpy?.mock.calls.flat().join('\n') ?? ''
    expect(logOutput).toContain('Runtime-owned tooling contract:')
    expect(logOutput).toContain('wp now owns execution for test, e2e, lint, format, and typecheck.')
    expect(logOutput).toContain(
      'Keep local authoring deps when imported directly: @changesets/cli, vitest, @playwright/test, typescript',
    )
    expect(logOutput).toContain(
      'Review execution-only deps for removal if they only powered local binaries: oxlint, oxfmt',
    )
    expect(logOutput).toContain(
      'Do not blanket-remove devDependencies just because wp can execute the tool.',
    )
  })

  it('persists webpresso/blueprints in config and scaffolds that layout for webpresso repos', async () => {
    markAsWebpressoRepo(repo)

    const code = await runInit({ cwd: repo, yes: true })
    expect(code).toBe(0)

    expect(existsSync(join(repo, 'webpresso', 'blueprints', 'planned', '.gitkeep'))).toBe(true)
    expect(existsSync(join(repo, 'webpresso', 'blueprints', 'README.md'))).toBe(true)
    expect(existsSync(join(repo, 'blueprints'))).toBe(false)

    const rc = JSON.parse(readFileSync(join(repo, '.webpressorc.json'), 'utf8')) as {
      blueprintsDir?: string
      installed: { tier3Skills: string[] }
    }
    expect(rc.blueprintsDir).toBe('webpresso/blueprints')
    expect(rc.installed.tier3Skills).toEqual(['base-kit'])

    const agents = readFileSync(join(repo, 'AGENTS.md'), 'utf8')
    expect(agents).toContain('[`webpresso/blueprints/`](./webpresso/blueprints/)')
    expect(agents).toContain('blueprint lifecycle directories under `webpresso/blueprints/`')
    expect(agents).not.toContain('./blueprints/')
    expect(agents).not.toContain('{{BLUEPRINTS_DIR}}')
  })

  it('rejects unknown opt-in skill names with exit code 1', async () => {
    const code = await runInit({ cwd: repo, yes: true, with: 'not-a-real-skill' })
    expect(code).toBe(1)
  })

  it('dry-run writes nothing', async () => {
    const code = await runInit({ cwd: repo, yes: true, 'dry-run': true })
    expect(code).toBe(0)
    expect(existsSync(join(repo, '.agent'))).toBe(false)
    expect(existsSync(join(repo, 'AGENTS.md'))).toBe(false)
    expect(existsSync(join(repo, '.webpressorc.json'))).toBe(false)
    expect(existsSync(join(repo, '.claude', 'hooks'))).toBe(false)
  })

  it('falls back to the currently executing package when the consumer package is not installed yet', async () => {
    rmSync(join(repo, 'node_modules', '@webpresso', 'agent-kit'), { force: true })

    const code = await runInit({ cwd: repo, yes: true })

    expect(code).toBe(0)
  }, 20_000)

  it('preserves existing unmanaged AGENTS.md without writing companion files by default', async () => {
    writeFileSync(join(repo, 'AGENTS.md'), '# Custom already-owned content')
    const code = await runInit({ cwd: repo, yes: true })
    expect(code).toBe(0)
    expect(readFileSync(join(repo, 'AGENTS.md'), 'utf8')).toBe('# Custom already-owned content')
    expect(existsSync(join(repo, 'AGENTS.md.new'))).toBe(false)
  })

  it('refreshes managed AGENTS blocks in place while preserving user-owned blocks', async () => {
    writeFileSync(
      join(repo, 'AGENTS.md'),
      [
        '<!-- >>> managed by webpresso (operating-contract) -->',
        '# Old heading',
        '<!-- <<< managed by webpresso (operating-contract) -->',
        '<!-- >>> user-owned (repo-customizations) -->',
        'Keep this customization',
        '<!-- <<< user-owned (repo-customizations) -->',
        '<!-- >>> managed by webpresso (planning-and-release) -->',
        'Old planning block',
        '<!-- <<< managed by webpresso (planning-and-release) -->',
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

  it('projects skills per host: OpenCode dir, plugins for Claude/Codex', async () => {
    const code = await runInit({ cwd: repo, yes: true })
    expect(code).toBe(0)

    // Wave-3: unified sync now populates per-IDE rule/skill surfaces.
    // Commands surfaces (`.claude/commands`) remain unwritten — covered by
    // the Claude Code plugin, not by wp setup.
    expect(existsSync(join(repo, '.claude', 'commands'))).toBe(false)
    // Claude skills come from the Claude Code plugin — wp setup does NOT project
    // a .claude/skills dir (doing so would double-show every skill).
    expect(existsSync(join(repo, '.claude', 'skills'))).toBe(false)
    // .cursor/rules now hosts copied rules (.mdc)
    expect(existsSync(join(repo, '.cursor', 'rules'))).toBe(true)
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
    expect(stopCommands.some((command) => command.includes('wp-stop-qa'))).toBe(true)
    expect(
      stopCommands.some(
        (command) =>
          command.includes('wp audit agents') && command.includes('# from-skill: verify'),
      ),
    ).toBe(true)
    expect(stopCommands.some((command) => command.includes('# from-skill: verify'))).toBe(true)

    // OpenCode: skill folders are symlinked into its primary .opencode/skills
    // root. Codex gets the same skills from its plugin, so no .agents/skills dir.
    const opencodeVerifySkill = join(repo, '.opencode', 'skills', 'verify')
    expect(statSync(opencodeVerifySkill).isDirectory()).toBe(true)
    expect(lstatSync(opencodeVerifySkill).isSymbolicLink()).toBe(true)
    expect(existsSync(join(opencodeVerifySkill, 'SKILL.md'))).toBe(true)
    expect(existsSync(join(repo, '.agents', 'skills', 'verify'))).toBe(false)

    // agent-hooks scaffolder writes .codex/hooks.json
    expect(existsSync(join(repo, '.codex', 'hooks.json'))).toBe(true)
    expect(existsSync(join(repo, '.webpresso', 'hooks-manifest.json'))).toBe(true)
  })

  it('disables and restores managed hooks through the manifest', async () => {
    expect(await runInit({ cwd: repo, yes: true })).toBe(0)

    const codexHooksPath = join(repo, '.codex', 'hooks.json')
    const manifestPath = join(repo, '.webpresso', 'hooks-manifest.json')

    const originalCodex = readJsonFile<{ hooks: Record<string, unknown> }>(codexHooksPath)
    expect(JSON.stringify(originalCodex)).toContain('wp-pretool-guard')

    expect(await runInit({ cwd: repo, yes: true, disableHooks: 'codex' })).toBe(0)

    const disabledCodex = readJsonFile<{ hooks: Record<string, unknown> }>(codexHooksPath)
    const disabledManifest = readJsonFile<{
      vendorState: { claude: 'enabled' | 'disabled'; codex: 'enabled' | 'disabled' }
    }>(manifestPath)
    expect(JSON.stringify(disabledCodex)).not.toContain('wp-pretool-guard')
    expect(disabledManifest.vendorState.codex).toBe('disabled')
    expect(disabledManifest.vendorState.claude).toBe('enabled')

    expect(await runInit({ cwd: repo, yes: true, restoreHooks: true })).toBe(0)

    const restoredCodex = readJsonFile<{ hooks: Record<string, unknown> }>(codexHooksPath)
    const restoredManifest = readJsonFile<{
      vendorState: { claude: 'enabled' | 'disabled'; codex: 'enabled' | 'disabled' }
    }>(manifestPath)
    expect(JSON.stringify(restoredCodex)).toContain('wp-pretool-guard')
    expect(restoredManifest.vendorState.codex).toBe('enabled')
    expect(restoredManifest.vendorState.claude).toBe('enabled')
  })

  it('keeps previously disabled vendors disabled on a normal follow-up setup run', async () => {
    expect(await runInit({ cwd: repo, yes: true })).toBe(0)
    expect(await runInit({ cwd: repo, yes: true, disableHooks: 'codex' })).toBe(0)

    expect(await runInit({ cwd: repo, yes: true })).toBe(0)

    const codexHooksPath = join(repo, '.codex', 'hooks.json')
    const manifestPath = join(repo, '.webpresso', 'hooks-manifest.json')
    const codexHooks = readFileSync(codexHooksPath, 'utf8')
    const manifest = readJsonFile<{
      vendorState: { claude: 'enabled' | 'disabled'; codex: 'enabled' | 'disabled' }
    }>(manifestPath)

    expect(codexHooks).not.toContain('wp-pretool-guard')
    expect(manifest.vendorState.codex).toBe('disabled')
    expect(manifest.vendorState.claude).toBe('enabled')
  })

  it('restore-hooks rebuilds the current direct-hook contract instead of replaying stale wrapper commands', async () => {
    expect(await runInit({ cwd: repo, yes: true })).toBe(0)

    const codexHooksPath = join(repo, '.codex', 'hooks.json')
    const claudeSettingsPath = join(repo, '.claude', 'settings.json')
    const manifestPath = join(repo, '.webpresso', 'hooks-manifest.json')

    writeFileSync(codexHooksPath, JSON.stringify({ hooks: {} }, null, 2))
    writeFileSync(claudeSettingsPath, JSON.stringify({ hooks: {} }, null, 2))
    writeHooksManifest(
      repo,
      {
        SessionStart: [
          {
            hooks: [
              {
                type: 'command',
                command:
                  '[ -x "$CLAUDE_PROJECT_DIR/.claude/hooks/managed/wp-sessionstart-routing.sh" ] && "$CLAUDE_PROJECT_DIR/.claude/hooks/managed/wp-sessionstart-routing.sh" || true',
              },
            ],
          },
        ],
      },
      {
        SessionStart: [
          {
            hooks: [
              {
                type: 'command',
                command: `if [ -x '${repo}/.codex/managed-hooks/wp-sessionstart-routing.sh' ]; then '${repo}/.codex/managed-hooks/wp-sessionstart-routing.sh'; else true; fi`,
              },
            ],
          },
        ],
      },
      { claude: 'enabled', codex: 'enabled' },
    )

    expect(await runInit({ cwd: repo, yes: true, restoreHooks: true })).toBe(0)

    const codexHooks = readFileSync(codexHooksPath, 'utf8')
    const claudeSettings = readFileSync(claudeSettingsPath, 'utf8')
    const manifest = readJsonFile<{
      claude: Record<string, unknown>
      codex: Record<string, unknown>
      vendorState: { claude: 'enabled' | 'disabled'; codex: 'enabled' | 'disabled' }
    }>(manifestPath)

    expect(codexHooks).toContain(' hook sessionstart-routing')
    expect(claudeSettings).toContain(' hook sessionstart-routing')
    expect(codexHooks).not.toContain('/.codex/managed-hooks/')
    expect(claudeSettings).not.toContain('/.claude/hooks/managed/')
    expect(JSON.stringify(manifest.codex)).toContain(' hook sessionstart-routing')
    expect(JSON.stringify(manifest.claude)).toContain(' hook sessionstart-routing')
    expect(JSON.stringify(manifest.codex)).not.toContain('/.codex/managed-hooks/')
    expect(JSON.stringify(manifest.claude)).not.toContain('/.claude/hooks/managed/')
    expect(manifest.vendorState.codex).toBe('enabled')
    expect(manifest.vendorState.claude).toBe('enabled')
  })

  it('does not mutate hook configs in disable-hooks dry-run mode', async () => {
    expect(await runInit({ cwd: repo, yes: true })).toBe(0)

    const codexHooksPath = join(repo, '.codex', 'hooks.json')
    const before = readFileSync(codexHooksPath, 'utf8')

    expect(await runInit({ cwd: repo, yes: true, disableHooks: 'codex', dryRun: true })).toBe(0)

    expect(readFileSync(codexHooksPath, 'utf8')).toBe(before)
  })

  it('fails restore-hooks when the hooks manifest is missing', async () => {
    expect(await runInit({ cwd: repo, yes: true })).toBe(0)
    rmSync(join(repo, '.webpresso', 'hooks-manifest.json'))

    const code = await runInit({ cwd: repo, yes: true, restoreHooks: true })

    expect(code).toBe(1)
    expect(consoleErrorSpy).toHaveBeenCalledWith(
      expect.stringContaining('no .webpresso/hooks-manifest.json found'),
    )
  })

  it('preserves opt-in skill config and generated surfaces on follow-up refresh', async () => {
    await runInit({ cwd: repo, yes: true, with: 'tanstack-query' })
    const firstConfig = readFileSync(join(repo, '.webpressorc.json'), 'utf8')
    rerunGeneratedAgentSurface(repo)
    const secondConfig = readFileSync(join(repo, '.webpressorc.json'), 'utf8')
    expect(secondConfig).toBe(firstConfig)
    // Second run reads config and re-applies — config should still list the
    // Opt-in skill the first run selected.
    const rc = JSON.parse(secondConfig) as {
      installed: { tier3Skills: string[] }
    }
    expect(rc.installed.tier3Skills).toContain('tanstack-query')

    // Wave-3: second invocation produces no generated companion files under
    // any rule/skill surface.
    expect(findCompanionFiles(repo)).toEqual([])
  })

  it('refreshes generated .agent content by default on rerun', async () => {
    const first = await runInit({ cwd: repo, yes: true })
    expect(first).toBe(0)

    const targetPath = join(repo, '.agent', 'commands', 'verify.md')
    const original = readFileSync(targetPath, 'utf8')
    writeFileSync(targetPath, '# locally drifted generated content\n')

    rerunGeneratedAgentSurface(repo)
    expect(readFileSync(targetPath, 'utf8')).toBe(original)
  })

  it('keeps fresh-only .agent files conservative on rerun', async () => {
    const first = await runInit({ cwd: repo, yes: true })
    expect(first).toBe(0)

    const targetPath = join(repo, '.agent', 'correlate.allow.yaml')
    writeFileSync(targetPath, 'manually curated: true\n')

    rerunGeneratedAgentSurface(repo)
    expect(readFileSync(targetPath, 'utf8')).toBe('manually curated: true\n')
  })
})

describe('DX output: lane framing and next-steps block', { timeout: 15_000 }, () => {
  let repo: string
  let originalCodexHome: string | undefined
  let originalHome: string | undefined
  let originalPath: string | undefined
  let logLines: string[]
  let originalLog: typeof console.log
  const silentStdout = { write: () => true }

  beforeEach(() => {
    repo = makeTempRepo()
    originalCodexHome = process.env.CODEX_HOME
    originalHome = process.env.HOME
    originalPath = process.env.PATH
    process.env.CODEX_HOME = join(repo, '.codex-home')
    process.env.HOME = join(repo, '.home')
    const fakeBinDir = join(repo, 'bin')
    const fakeOmx = join(fakeBinDir, 'omx')
    mkdirSync(fakeBinDir, { recursive: true })
    writeFileSync(fakeOmx, '#!/usr/bin/env sh\necho 1.2.3\n', 'utf8')
    chmodSync(fakeOmx, 0o755)
    // Command detection now uses a real PATH scan (#runtime/command-exists), not the
    // mocked `which` spawnSync, so stage a real `claude` on PATH for the flows that
    // gate on it (Claude-plugin install, OMC). `codex` is intentionally NOT staged:
    // no assertion here needs codex detection, and the async `spawn` mock does not
    // model codex-plugin's install handshake (it would hang). The real codex
    // app-server boundary is deadline-guarded, so this is a test-mock gap, not a
    // product hang.
    const fakeClaude = join(fakeBinDir, 'claude')
    writeFileSync(fakeClaude, '#!/usr/bin/env sh\nexit 0\n', 'utf8')
    chmodSync(fakeClaude, 0o755)
    process.env.PATH = `${fakeBinDir}:${originalPath ?? ''}`
    spawnSyncMock.mockClear()
    spawnMock.mockClear()
    spawnMock.mockImplementation(() => new FakeAsyncChild())
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
    if (originalPath === undefined) {
      delete process.env.PATH
    } else {
      process.env.PATH = originalPath
    }
    rmSync(repo, { recursive: true, force: true })
  })

  it('prints lane framing after a successful run', async () => {
    await runInit({ cwd: repo, yes: true }, { stdout: silentStdout })
    const allOutput = logLines.join('\n')
    expect(allOutput).toContain('wp_*')
    expect(allOutput).toContain('rtk')
    expect(allOutput).toContain('external tools')
  })

  it('does not replay remembered external integrations on plain reruns', async () => {
    writeFileSync(
      join(repo, '.webpressorc.json'),
      JSON.stringify(
        {
          version: '1',
          installed: { tier3Skills: ['base-kit'] },
          integrations: {
            omx: { enabled: true, scope: 'user' },
            omc: { enabled: true, scope: 'user' },
            gstack: { enabled: true },
          },
          rules: { overrides: [] },
          scripts: {},
          durablePlanningRoot: '.agent/planning/',
        },
        null,
        2,
      ),
    )

    await runInit({ cwd: repo, yes: true }, { stdout: silentStdout })

    const allOutput = logLines.join('\n')
    const omxCalls = spawnSyncMock.mock.calls.filter((call) => call[0] === 'omx')
    const omcCalls = spawnSyncMock.mock.calls.filter(
      (call) =>
        call[0] === 'claude' &&
        Array.isArray(call[1]) &&
        ['plugin', 'marketplace'].includes(String(call[1][0])),
    )
    const gstackCalls = spawnMock.mock.calls.filter(
      (call) => call[0] === 'git' || call[0] === './setup',
    )
    const rewritten = readJsonFile<Record<string, unknown>>(join(repo, '.webpressorc.json'))

    expect(omxCalls).toHaveLength(0)
    expect(omcCalls).toHaveLength(0)
    expect(gstackCalls).toHaveLength(0)
    expect(allOutput).toContain('wp setup no longer remembers them across reruns')
    expect(rewritten.integrations ?? {}).toEqual({})
  })

  it('prints the canonical next-steps block on non-dry-run', async () => {
    await runInit({ cwd: repo, yes: true }, { stdout: silentStdout })
    const allOutput = logLines.join('\n')
    expect(allOutput).toContain('wp hooks doctor')
    expect(allOutput).toContain('wp_audit(kind="docs-frontmatter")')
    expect(allOutput).toContain('wp gain')
  })

  it('prints Claude plugin auto-enable status on non-dry-run', async () => {
    await runInit({ cwd: repo, yes: true }, { stdout: silentStdout })
    const allOutput = logLines.join('\n')
    expect(allOutput).toContain('claude plugin:')
  })

  it('does not report OMC setup status unless OMC is explicitly requested', async () => {
    await runInit({ cwd: repo, yes: true }, { stdout: silentStdout })
    const allOutput = logLines.join('\n')
    expect(allOutput).not.toContain('omc plugin:')
  })

  it('reports OMC setup status when OMC is explicitly requested', async () => {
    await runInit({ cwd: repo, yes: true, with: 'omc' }, { stdout: silentStdout })
    const allOutput = logLines.join('\n')
    expect(allOutput).toContain('omc plugin:')
  })

  it('omits next-steps block in --dry-run mode', async () => {
    await runInit({ cwd: repo, yes: true, 'dry-run': true }, { stdout: silentStdout })
    const allOutput = logLines.join('\n')
    expect(allOutput).not.toContain('wp hooks doctor')
    expect(allOutput).not.toContain('wp_audit(kind="docs-frontmatter")')
    expect(allOutput).not.toContain('wp gain')
  })

  it('lane framing is present even in --dry-run mode', async () => {
    await runInit({ cwd: repo, yes: true, 'dry-run': true }, { stdout: silentStdout })
    const allOutput = logLines.join('\n')
    expect(allOutput).toContain('wp_*')
  })
})

describe('warnIfNonLocalCli (DX2)', () => {
  let repo: string
  let originalError: typeof console.error
  let captured: string[]

  beforeEach(() => {
    repo = join(tmpdir(), `wp-warn-cli-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
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

  it('warns when a consumer repo has no published @webpresso/agent-kit pin', async () => {
    const { warnIfNonLocalCli } = await import('./detect-consumer.js')

    warnIfNonLocalCli(repo, 'file:///Users/me/.vite-plus/bin/wp')

    expect(
      captured.some(
        (line) =>
          line.includes('warning: missing or invalid @webpresso/agent-config dependency pin') &&
          line.includes('published semver range') &&
          line.includes('global `wp setup`'),
      ),
    ).toBe(true)
  })

  it('warns when a consumer tries to run the repo-local node_modules CLI', async () => {
    const { warnIfNonLocalCli } = await import('./detect-consumer.js')
    const cliFile = join(repo, 'node_modules', '@webpresso', 'agent-kit', 'dist', 'cli', 'cli.js')
    mkdirSync(dirname(cliFile), { recursive: true })
    writeFileSync(
      join(repo, 'node_modules', '@webpresso', 'agent-kit', 'package.json'),
      JSON.stringify({ name: '@webpresso/agent-kit' }),
    )
    writeFileSync(cliFile, '// stub')

    warnIfNonLocalCli(repo, `file://${cliFile}`)

    expect(
      captured.some(
        (line) =>
          line.includes("warning: wp is running from this repo's node_modules") &&
          line.includes('vp install -g @webpresso/agent-kit'),
      ),
    ).toBe(true)
  })

  it('stays silent for global wp when the repo pins a published semver range', async () => {
    const { warnIfNonLocalCli } = await import('./detect-consumer.js')
    writeFileSync(
      join(repo, 'package.json'),
      JSON.stringify({
        name: '@acme/demo',
        private: true,
        devDependencies: { '@webpresso/agent-config': '^1.2.3' },
      }),
    )

    warnIfNonLocalCli(repo, 'file:///Users/me/.vite-plus/bin/wp')

    expect(captured).toEqual([])
  })

  it('warns for latest/workspace/file/link pins', async () => {
    const { warnIfNonLocalCli } = await import('./detect-consumer.js')
    for (const version of ['latest', 'workspace:*', 'file:../agent-kit', 'link:../agent-kit']) {
      captured = []
      writeFileSync(
        join(repo, 'package.json'),
        JSON.stringify({
          name: '@acme/demo',
          private: true,
          devDependencies: { '@webpresso/agent-config': version },
        }),
      )

      warnIfNonLocalCli(repo, 'file:///Users/me/.vite-plus/bin/wp')

      expect(captured.join('\n')).toContain(
        'missing or invalid @webpresso/agent-config dependency pin',
      )
    }
  })

  it('self-mode short-circuits (consumer IS @webpresso/agent-kit)', async () => {
    writeFileSync(
      join(repo, 'package.json'),
      JSON.stringify({ name: '@webpresso/agent-kit', private: true }),
    )
    const { warnIfNonLocalCli } = await import('./detect-consumer.js')

    warnIfNonLocalCli(repo, 'file:///tmp/global/node_modules/@webpresso/agent-kit/dist/cli/cli.js')

    expect(captured).toEqual([])
  })
})
