import { spawnSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
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

function envFlag(env: Record<string, string | undefined>, name: string): boolean {
  return env[name] === '1'
}

function requireHostBinary(
  command: string,
  required: boolean,
  detectCommand: (name: string) => boolean = hasCommand,
): boolean {
  const installed = detectCommand(command)
  if (!installed && required) throw new Error(`${command} required but not on PATH`)
  return installed
}

const RUN_HOST_SMOKE = envFlag(process.env, 'WP_RUN_HOST_SMOKE')
const REQUIRE_CLAUDE = envFlag(process.env, 'WP_REQUIRE_CLAUDE')
const REQUIRE_CODEX = envFlag(process.env, 'WP_REQUIRE_CODEX')
const REQUIRE_CURSOR = envFlag(process.env, 'WP_REQUIRE_CURSOR')
const REQUIRE_OPENCODE = envFlag(process.env, 'WP_REQUIRE_OPENCODE')

describe('wp setup host smoke gating', () => {
  it('parses live host probe flags only from exact "1" values', () => {
    expect(envFlag({ WP_RUN_HOST_SMOKE: '1' }, 'WP_RUN_HOST_SMOKE')).toBe(true)
    expect(envFlag({ WP_RUN_HOST_SMOKE: 'true' }, 'WP_RUN_HOST_SMOKE')).toBe(false)
    expect(envFlag({ WP_RUN_HOST_SMOKE: '0' }, 'WP_RUN_HOST_SMOKE')).toBe(false)
    expect(envFlag({}, 'WP_RUN_HOST_SMOKE')).toBe(false)
  })

  it('does not silently require optional live host binaries in default CI', () => {
    if (RUN_HOST_SMOKE) return

    expect({
      codex: REQUIRE_CODEX,
      cursor: REQUIRE_CURSOR,
      opencode: REQUIRE_OPENCODE,
    }).toStrictEqual({
      codex: false,
      cursor: false,
      opencode: false,
    })
  })

  it('fails closed when a required host binary is absent', () => {
    expect(() => requireHostBinary('codex', true, () => false)).toThrow(
      'codex required but not on PATH',
    )
    expect(requireHostBinary('codex', false, () => false)).toBe(false)
    expect(requireHostBinary('codex', true, () => true)).toBe(true)
  })
})

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
          '@webpresso/agent-kit': `file:${REPO_ROOT}`,
        },
      },
      null,
      2,
    ) + '\n',
  )
  return dir
}

function makeCodexMarketplace(pluginRoot: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'wp-codex-marketplace-'))
  mkdirSync(path.join(dir, '.agents', 'plugins'), { recursive: true })
  mkdirSync(path.join(dir, 'plugins'), { recursive: true })
  symlinkSync(pluginRoot, path.join(dir, 'plugins', 'agent-kit'), 'dir')
  writeFileSync(
    path.join(dir, '.agents', 'plugins', 'marketplace.json'),
    JSON.stringify(
      {
        name: 'local-webpresso-test',
        interface: { displayName: 'Local Webpresso Test' },
        plugins: [
          {
            name: 'agent-kit',
            source: { source: 'local', path: './plugins/agent-kit' },
            policy: { installation: 'AVAILABLE', authentication: 'ON_INSTALL' },
            category: 'Development',
          },
        ],
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

    const setup = run(CLI_RUNTIME, [CLI_PATH, 'setup', '--yes', '--cwd', repo], repo, {
      CODEX_HOME: codexHome,
      WP_SKIP_RTK: '1',
      WP_SKIP_OMC: '1',
    })
    expect(setup.code).toBe(0)
    expect(existsSync(path.join(repo, '.claude', 'settings.json'))).toBe(true)
    expect(readFileSync(path.join(repo, '.claude', 'settings.json'), 'utf8')).toContain(
      'wp-sessionstart-routing',
    )
    const codexConfig = readFileSync(path.join(codexHome, 'config.toml'), 'utf8')
    expect(codexConfig).toContain('[features]')
    expect(codexConfig).toContain('hooks = true')
    expect(readFileSync(path.join(codexHome, 'config.toml'), 'utf8')).toContain(
      '[mcp_servers.webpresso]',
    )
  }, 240_000)

  it('default setup configures only webpresso host entries', () => {
    const install = run('vp', ['install', '--ignore-scripts'], repo, {})
    expect(install.code).toBe(0)

    const setup = run(CLI_RUNTIME, [CLI_PATH, 'setup', '--yes', '--cwd', repo], repo, {
      CODEX_HOME: codexHome,
      WP_SKIP_RTK: '1',
      WP_SKIP_OMC: '1',
    })
    expect(setup.code).toBe(0)
    expect(readFileSync(path.join(repo, '.claude', 'settings.json'), 'utf8')).toContain(
      'wp-precompact-snapshot',
    )
    expect(readFileSync(path.join(codexHome, 'config.toml'), 'utf8')).toContain(
      '[mcp_servers.webpresso]',
    )
    expect(readFileSync(path.join(repo, '.codex', 'hooks.json'), 'utf8')).toContain(
      'wp-pretool-guard',
    )
  }, 240_000)

  it('Claude host validates the packaged webpresso plugin MCP entry', () => {
    if (!requireHostBinary('claude', REQUIRE_CLAUDE)) {
      return
    }

    const validate = run('claude', ['plugin', 'validate', '.'], REPO_ROOT, {})
    expect(validate.code).toBe(0)
    expect(readFileSync(path.join(REPO_ROOT, '.claude-plugin', 'plugin.json'), 'utf8')).toContain(
      '"webpresso"',
    )
  }, 240_000)

  it('fails when codex is required but not on PATH', () => {
    if (hasCommand('codex')) return

    expect(requireHostBinary('codex', REQUIRE_CODEX)).toBe(false)
  })

  it('fails when claude is required but not on PATH', () => {
    if (hasCommand('claude')) return

    expect(requireHostBinary('claude', REQUIRE_CLAUDE)).toBe(false)
  })

  it('fails when cursor is required but not on PATH', () => {
    if (hasCommand('cursor')) return

    expect(requireHostBinary('cursor', REQUIRE_CURSOR)).toBe(false)
  })

  it('Codex host sees the webpresso MCP entry when installed', () => {
    if (!requireHostBinary('codex', REQUIRE_CODEX)) {
      return
    }

    const install = run('vp', ['install', '--ignore-scripts'], repo, {})
    expect(install.code).toBe(0)
    const setup = run(CLI_RUNTIME, [CLI_PATH, 'setup', '--yes', '--cwd', repo], repo, {
      CODEX_HOME: codexHome,
      WP_SKIP_RTK: '1',
      WP_SKIP_OMC: '1',
    })
    expect(setup.code).toBe(0)

    const list = run('codex', ['mcp', 'list'], repo, { CODEX_HOME: codexHome })
    expect(list.code).toBe(0)
    expect(list.stdout).toContain('webpresso')
  }, 240_000)

  it('Codex host installs the local packaged plugin and exposes its bundled MCP entry', () => {
    if (!requireHostBinary('codex', REQUIRE_CODEX)) {
      return
    }

    const marketplace = makeCodexMarketplace(REPO_ROOT)
    try {
      const addMarketplace = run(
        'codex',
        ['plugin', 'marketplace', 'add', marketplace, '--json'],
        repo,
        {
          CODEX_HOME: codexHome,
        },
      )
      expect(addMarketplace.code).toBe(0)

      const available = run('codex', ['plugin', 'list', '--available', '--json'], repo, {
        CODEX_HOME: codexHome,
      })
      expect(available.code).toBe(0)
      expect(available.stdout).toContain('agent-kit@local-webpresso-test')

      const addPlugin = run(
        'codex',
        ['plugin', 'add', 'agent-kit', '--marketplace', 'local-webpresso-test', '--json'],
        repo,
        { CODEX_HOME: codexHome },
      )
      expect(addPlugin.code).toBe(0)
      expect(addPlugin.stdout).toContain('agent-kit@local-webpresso-test')

      const list = run('codex', ['mcp', 'list'], repo, { CODEX_HOME: codexHome })
      expect(list.code).toBe(0)
      expect(list.stdout).toContain('webpresso')
      expect(list.stdout).toContain('${PLUGIN_ROOT}/bin/wp')
    } finally {
      rmSync(marketplace, { recursive: true, force: true })
    }
  }, 240_000)

  it('gracefully skips OpenCode host check when opencode is not on PATH', () => {
    if (hasCommand('opencode')) return

    expect(requireHostBinary('opencode', REQUIRE_OPENCODE)).toBe(false)
  })

  it('OpenCode host sees the webpresso MCP entry when installed', () => {
    if (!REQUIRE_OPENCODE) {
      return
    }
    if (!requireHostBinary('opencode', REQUIRE_OPENCODE)) {
      return
    }

    const install = run('vp', ['install', '--ignore-scripts'], repo, {})
    expect(install.code).toBe(0)
    const setup = run(CLI_RUNTIME, [CLI_PATH, 'setup', '--yes', '--cwd', repo], repo, {
      CODEX_HOME: codexHome,
      WP_SKIP_RTK: '1',
      WP_SKIP_OMC: '1',
    })
    expect(setup.code).toBe(0)

    const list = run('opencode', ['mcp', 'list'], repo, {})
    expect(list.code).toBe(0)
    const stdout = stripAnsi(list.stdout)
    expect(stdout).toContain('webpresso')
    expect(stdout).toContain('✓ webpresso')
  }, 240_000)

  it('hooks doctor passes host checks for installed hosts', () => {
    const install = run('vp', ['install', '--ignore-scripts'], repo, {})
    expect(install.code).toBe(0)
    const setup = run(CLI_RUNTIME, [CLI_PATH, 'setup', '--yes', '--cwd', repo], repo, {
      CODEX_HOME: codexHome,
      WP_SKIP_RTK: '1',
      WP_RUN_HOST_SMOKE: '1',
      WP_SKIP_OMC: '1',
    })
    expect(setup.code).toBe(0)

    const doctor = run(
      CLI_RUNTIME,
      [CLI_PATH, 'hooks', 'doctor', '--hosts', 'required', '--host', 'codex', '--host', 'claude'],
      repo,
      {
        CODEX_HOME: codexHome,
      },
    )
    expect(doctor.code).toBe(0)
  }, 240_000)
})
