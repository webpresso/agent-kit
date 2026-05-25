import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '..', '..', '..', '..')
const SOURCE_CLI_PATH = path.join(REPO_ROOT, 'src', 'cli', 'cli.ts')
const DIST_CLI_PATH = path.join(REPO_ROOT, 'dist', 'esm', 'cli', 'cli.js')
const CLI_PATH = existsSync(SOURCE_CLI_PATH) ? SOURCE_CLI_PATH : DIST_CLI_PATH
const CLI_RUNTIME = CLI_PATH.endsWith('.ts') ? '/opt/homebrew/bin/bun' : process.execPath

function hasCommand(command: string): boolean {
  return spawnSync('which', [command], { stdio: 'ignore' }).status === 0
}

const RUN_HOST_SMOKE = process.env.WP_RUN_HOST_SMOKE === '1'
const REQUIRE_CODEX = process.env.WP_REQUIRE_CODEX === '1'
const REQUIRE_OPENCODE = process.env.WP_REQUIRE_OPENCODE === '1'

const ANSI_ESCAPE_PATTERN = new RegExp(String.raw`\u001B\[[0-9;]*m`, 'g')

function stripAnsi(text: string): string {
  return text.replace(ANSI_ESCAPE_PATTERN, '')
}

function run(
  cmd: string,
  args: string[],
  cwd: string,
  env: Record<string, string>,
): { code: number; stdout: string; stderr: string } {
  const result = spawnSync(cmd, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf8',
  })
  return { code: result.status ?? -1, stdout: result.stdout ?? '', stderr: result.stderr ?? '' }
}

function makeRepo(): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'wp-host-smoke-'))
  spawnSync('git', ['init', '-q'], { cwd: dir })
  spawnSync('git', ['commit', '--allow-empty', '-q', '-m', 'bootstrap'], { cwd: dir })
  writeFileSync(
    path.join(dir, 'package.json'),
    JSON.stringify(
      {
        name: 'wp-host-smoke',
        private: true,
        packageManager: 'pnpm@10.33.0',
        devDependencies: {
          webpresso: `file:${REPO_ROOT}`,
        },
      },
      null,
      2,
    ) + '\n',
  )
  return dir
}

describe.skipIf(!RUN_HOST_SMOKE)('wp setup host smoke', () => {
  let repo: string
  let codexHome: string

  beforeEach(() => {
    repo = makeRepo()
    codexHome = mkdtempSync(path.join(tmpdir(), 'wp-codex-home-'))
  })

  afterEach(() => {
    rmSync(repo, { recursive: true, force: true })
    rmSync(codexHome, { recursive: true, force: true })
  })

  it('installs locally and setup generates healthy host configs', () => {
    const install = run('vp', ['install', '--ignore-scripts'], repo, {})
    expect(install.code).toBe(0)

    const setup = run(
      CLI_RUNTIME,
      [CLI_PATH, 'setup', '--yes', '--with', 'context-mode', '--cwd', repo],
      repo,
      {
        CODEX_HOME: codexHome,
        WP_SKIP_GSTACK: '1',
        WP_SKIP_RTK: '1',
        WP_SKIP_OMC: '1',
      },
    )
    expect(setup.code).toBe(0)
    expect(existsSync(path.join(repo, 'opencode.json'))).toBe(true)
    expect(readFileSync(path.join(repo, 'opencode.json'), 'utf8')).toContain('context-mode')
    expect(readFileSync(path.join(repo, 'opencode.json'), 'utf8')).toContain('webpresso')
    expect(readFileSync(path.join(codexHome, 'config.toml'), 'utf8')).toContain(
      '[mcp_servers.context-mode]',
    )
    expect(readFileSync(path.join(codexHome, 'config.toml'), 'utf8')).toContain(
      '[mcp_servers.webpresso]',
    )
    expect(readFileSync(path.join(codexHome, 'hooks.json'), 'utf8')).toContain(
      'context-mode hook codex pretooluse',
    )
  }, 240_000)

  it('default setup leaves context-mode out of host configs', () => {
    const install = run('vp', ['install', '--ignore-scripts'], repo, {})
    expect(install.code).toBe(0)

    const setup = run(CLI_RUNTIME, [CLI_PATH, 'setup', '--yes', '--cwd', repo], repo, {
      CODEX_HOME: codexHome,
      WP_SKIP_GSTACK: '1',
      WP_SKIP_RTK: '1',
      WP_SKIP_OMC: '1',
    })
    expect(setup.code).toBe(0)
    expect(existsSync(path.join(repo, 'opencode.json'))).toBe(true)
    expect(readFileSync(path.join(repo, 'opencode.json'), 'utf8')).toContain('webpresso')
    expect(readFileSync(path.join(codexHome, 'config.toml'), 'utf8')).toContain(
      '[mcp_servers.webpresso]',
    )
    expect(readFileSync(path.join(repo, 'opencode.json'), 'utf8')).not.toContain('context-mode')
    expect(readFileSync(path.join(codexHome, 'config.toml'), 'utf8')).not.toContain(
      '[mcp_servers.context-mode]',
    )
    expect(readFileSync(path.join(codexHome, 'hooks.json'), 'utf8')).not.toContain(
      'context-mode hook codex pretooluse',
    )
  }, 240_000)

  it('fails when codex is required but not on PATH', () => {
    if (hasCommand('codex')) return

    expect(REQUIRE_CODEX).toBe(false)
    expect(() => {
      if (REQUIRE_CODEX) throw new Error('codex required but not on PATH')
    }).not.toThrow()
  })

  it('Codex host sees webpresso + context-mode MCP entries when installed', () => {
    if (!hasCommand('codex')) {
      if (REQUIRE_CODEX) throw new Error('codex required but not on PATH')
      return
    }

    const install = run('vp', ['install', '--ignore-scripts'], repo, {})
    expect(install.code).toBe(0)
    const setup = run(
      CLI_RUNTIME,
      [CLI_PATH, 'setup', '--yes', '--with', 'context-mode', '--cwd', repo],
      repo,
      {
        CODEX_HOME: codexHome,
        WP_SKIP_GSTACK: '1',
        WP_SKIP_RTK: '1',
        WP_SKIP_OMC: '1',
      },
    )
    expect(setup.code).toBe(0)

    const list = run('codex', ['mcp', 'list'], repo, { CODEX_HOME: codexHome })
    expect(list.code).toBe(0)
    expect(list.stdout).toContain('webpresso')
    expect(list.stdout).toContain('context-mode')
  }, 240_000)

  it('gracefully skips OpenCode host check when opencode is not on PATH', () => {
    if (hasCommand('opencode')) return

    expect(REQUIRE_OPENCODE).toBe(false)
  })

  it('OpenCode host sees webpresso + context-mode MCP entries when installed', () => {
    if (!hasCommand('opencode')) {
      if (REQUIRE_OPENCODE) throw new Error('opencode required but not on PATH')
      return
    }

    const install = run('vp', ['install', '--ignore-scripts'], repo, {})
    expect(install.code).toBe(0)
    const setup = run(
      CLI_RUNTIME,
      [CLI_PATH, 'setup', '--yes', '--with', 'context-mode', '--cwd', repo],
      repo,
      {
        CODEX_HOME: codexHome,
        WP_SKIP_GSTACK: '1',
        WP_SKIP_RTK: '1',
        WP_SKIP_OMC: '1',
      },
    )
    expect(setup.code).toBe(0)

    const list = run('opencode', ['mcp', 'list'], repo, {})
    expect(list.code).toBe(0)
    const stdout = stripAnsi(list.stdout)
    expect(stdout).toContain('webpresso')
    expect(stdout).toContain('context-mode')
    expect(stdout).toContain('✓ webpresso')
    expect(stdout).toContain('✓ context-mode')
  }, 240_000)

  it('hooks doctor passes host checks for installed hosts', () => {
    const install = run('vp', ['install', '--ignore-scripts'], repo, {})
    expect(install.code).toBe(0)
    const setup = run(CLI_RUNTIME, [CLI_PATH, 'setup', '--yes', '--cwd', repo], repo, {
      CODEX_HOME: codexHome,
      WP_SKIP_GSTACK: '1',
      WP_SKIP_RTK: '1',
      WP_RUN_HOST_SMOKE: '1',
      WP_SKIP_OMC: '1',
    })
    expect(setup.code).toBe(0)

    const doctor = run('vp', ['exec', 'wp', 'hooks', 'doctor', '--hosts', 'auto'], repo, {
      CODEX_HOME: codexHome,
    })
    expect(doctor.code).toBe(0)
  }, 240_000)
})
