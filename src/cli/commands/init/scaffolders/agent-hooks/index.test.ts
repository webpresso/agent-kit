import {
  accessSync,
  chmodSync,
  constants,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { spawn, spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CLAUDE_PLUGIN_ID } from '#cli/commands/init/scaffolders/claude-plugin/index.js'
import { buildCursorHooksConfig } from './emitters/cursor.js'

import {
  buildWebpressoHookGroups,
  classifyWebpressoHookBin,
  hoistTopLevelEvents,
  hookSubcommandFor,
  resolvePackageRootForHookLaunchers,
  resolveNodeBinaryForManagedHookLaunchers,
  scaffoldAgentHooks,
  trustCodexWebpressoHooksForRepo,
  trustCodexPresetHooksForUser,
} from './index.js'

function quoteShell(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function guardedHookCommand(binPath: string, fallback: string): string {
  return `if [ -x ${binPath} ]; then ${binPath}; else ${fallback}; fi`
}

function codexBinCommand(repoRoot: string, name: string): string {
  const binPath = quoteShell(join(repoRoot, '.codex', 'managed-hooks', `${name}.sh`))
  if (name === 'wp-stop-qa' || name === 'wp-precompact-snapshot') {
    return guardedHookCommand(binPath, `printf '%s\\n' '{}'`)
  }
  if (name === 'wp-pretool-guard') {
    return guardedHookCommand(
      binPath,
      `printf '%s\\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"wp not found on PATH. Install with npm install -g @webpresso/agent-kit and re-run wp setup."}}'`,
    )
  }
  return guardedHookCommand(binPath, 'true')
}

function claudeBinCommand(name: string): string {
  const binPath = `$CLAUDE_PROJECT_DIR/.claude/hooks/managed/${name}.sh`
  if (name === 'wp-stop-qa' || name === 'wp-precompact-snapshot') {
    return guardedHookCommand(`"${binPath}"`, `printf '%s\\n' '{}'`)
  }
  if (name === 'wp-pretool-guard') {
    return guardedHookCommand(
      `"${binPath}"`,
      `printf '%s\\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"wp not found on PATH. Install with npm install -g @webpresso/agent-kit and re-run wp setup."}}'`,
    )
  }
  return guardedHookCommand(`"${binPath}"`, 'true')
}

const WEBPRESSO_HOOK_BINS = [
  'wp-sessionstart-routing',
  'wp-pretool-guard',
  'wp-post-tool',
  'wp-guard-switch',
  'wp-stop-qa',
  'wp-precompact-snapshot',
] as const

function installFakeNodeRuntime(repoRoot: string): string {
  const fakeNode = join(repoRoot, 'toolchain', 'node')
  mkdirSync(join(repoRoot, 'toolchain'), { recursive: true })
  writeFileSync(
    fakeNode,
    `#!/bin/sh
if [ -n "\${WP_HOOK_SMOKE_RUNTIME_LOG:-}" ]; then
  printf '%s\\n' "$*" >> "\${WP_HOOK_SMOKE_RUNTIME_LOG}"
fi
script="$1"
shift
if [ -n "\${WP_HOOK_SMOKE_BIN_DIR:-}" ] && [ -n "$script" ]; then
  fixture="\${WP_HOOK_SMOKE_BIN_DIR}/$(basename "$script")"
  if [ -f "$fixture" ]; then
    if [ -n "\${WP_HOOK_SMOKE_BIN_LOG:-}" ]; then
      bin_name="\${script##*/}"
      printf '%s\\n' "\${bin_name%.js}" >> "\${WP_HOOK_SMOKE_BIN_LOG}"
    fi
    printf '%s\\n' '{}'
    exit 0
  fi
fi
exec ${quoteShell(process.execPath)} "$script" "$@"
`,
    'utf8',
  )
  chmodSync(fakeNode, 0o755)
  return fakeNode
}

function installFakeWebpressoBins(repoRoot: string): string {
  const binDir = join(repoRoot, 'fixture-hook-bins')
  mkdirSync(binDir, { recursive: true })
  for (const bin of WEBPRESSO_HOOK_BINS) {
    const binPath = join(binDir, `${bin}.js`)
    writeFileSync(binPath, `# fixture marker for ${bin}\n`, 'utf8')
    chmodSync(binPath, 0o755)
  }
  return binDir
}

function assertSmokeRanEveryWebpressoBin(runtimeLog: string, binLog: string): void {
  const runtimeArgs = readFileSync(runtimeLog, 'utf8')
  const executedBins = readFileSync(binLog, 'utf8').trim().split('\n').filter(Boolean)
  expect(new Set(executedBins)).toStrictEqual(new Set(WEBPRESSO_HOOK_BINS))
  for (const bin of WEBPRESSO_HOOK_BINS) {
    expect(runtimeArgs).toContain(`${bin}.js`)
  }
}

function initGitRepo(root: string): void {
  const result = spawnSync('git', ['init'], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
  })
  expect(result.status, result.stderr).toBe(0)
}

async function runShellCommand(
  command: string,
  options: {
    cwd: string
    env?: NodeJS.ProcessEnv
    timeoutMs?: number
  },
): Promise<{ status: number | null; stdout: string; stderr: string; command: string }> {
  return await new Promise((resolve, reject) => {
    const child = spawn('sh', ['-c', command], {
      cwd: options.cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    })

    let stdout = ''
    let stderr = ''
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString()
    })
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString()
    })
    child.on('error', reject)
    const timeout = setTimeout(() => {
      child.kill('SIGTERM')
      resolve({
        status: null,
        stdout,
        stderr: `${stderr}\nTimed out waiting for hook command to exit.`,
        command,
      })
    }, options.timeoutMs ?? 5000)
    child.on('close', (status) => {
      clearTimeout(timeout)
      resolve({ status, stdout, stderr, command })
    })
  })
}

async function runHookCommands(
  commands: readonly string[],
  options: {
    cwd: string
    env?: NodeJS.ProcessEnv
  },
): Promise<Array<{ status: number | null; stdout: string; stderr: string; command: string }>> {
  const batchCommand = commands.join('\n')
  return [
    await runShellCommand(batchCommand, {
      ...options,
      timeoutMs: Math.max(5000, commands.length * 5000),
    }),
  ]
}

describe('hookSubcommandFor (managed-launcher dispatch gate)', () => {
  it('returns the wp hook subcommand for dispatchable managed hooks', () => {
    expect(hookSubcommandFor('wp-pretool-guard')).toStrictEqual('pretool-guard')
    expect(hookSubcommandFor('wp-sessionstart-routing')).toStrictEqual('sessionstart-routing')
    expect(hookSubcommandFor('wp-precompact-snapshot')).toStrictEqual('precompact-snapshot')
  })

  it('returns undefined for a non-dispatchable bin (no wp hook handler)', () => {
    expect(hookSubcommandFor('wp-not-a-real-hook')).toStrictEqual(undefined)
    expect(hookSubcommandFor('some-third-party-hook')).toStrictEqual(undefined)
  })
})

describe('scaffoldAgentHooks', () => {
  let repoRoot: string
  let previousCodexHome: string | undefined
  let previousHome: string | undefined
  let previousHookNodePath: string | undefined

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'wp-agent-hooks-'))
    previousCodexHome = process.env.CODEX_HOME
    previousHome = process.env.HOME
    previousHookNodePath = process.env.WP_HOOK_NODE_PATH
    process.env.HOME = join(repoRoot, '.home')
    process.env.CODEX_HOME = join(repoRoot, '.codex-home')
  })

  afterEach(async () => {
    if (previousCodexHome === undefined) delete process.env.CODEX_HOME
    else process.env.CODEX_HOME = previousCodexHome
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
    if (previousHookNodePath === undefined) delete process.env.WP_HOOK_NODE_PATH
    else process.env.WP_HOOK_NODE_PATH = previousHookNodePath
    await import('node:fs/promises').then((fs) => fs.rm(repoRoot, { recursive: true, force: true }))
  })

  function createFakeCodexAppServer(
    responses: ReadonlyArray<{
      data: Array<{
        cwd: string
        hooks: Array<Record<string, unknown>>
        warnings: string[]
        errors: string[]
      }>
    }>,
  ): {
    api: {
      hooksList(cwds: string[]): Promise<(typeof responses)[number]>
      configBatchWrite(params: unknown): Promise<{}>
      close(): void
    }
    hooksListCalls: string[][]
    batchWrites: unknown[]
  } {
    const hooksListCalls: string[][] = []
    const batchWrites: unknown[] = []
    return {
      hooksListCalls,
      batchWrites,
      api: {
        async hooksList(cwds: string[]) {
          hooksListCalls.push(cwds)
          const response = responses[hooksListCalls.length - 1]
          if (!response) throw new Error('unexpected hooks/list call')
          return response
        },
        async configBatchWrite(params: unknown) {
          batchWrites.push(params)
          return {}
        },
        close() {},
      },
    }
  }

  it('adds .claude to worktree.symlinkDirectories when missing', async () => {
    await scaffoldAgentHooks({ repoRoot, options: {} })

    const settings = JSON.parse(
      readFileSync(join(repoRoot, '.claude', 'settings.json'), 'utf8'),
    ) as {
      worktree: { symlinkDirectories: string[] }
    }

    expect(settings.worktree.symlinkDirectories).toContain('.claude')
  })

  it('creates user Claude settings that enable the webpresso plugin', async () => {
    await scaffoldAgentHooks({ repoRoot, options: {} })

    const settings = JSON.parse(
      readFileSync(join(repoRoot, '.home', '.claude', 'settings.json'), 'utf8'),
    ) as {
      enabledPlugins: Record<string, boolean>
    }

    // Couples the auto-enable key to the single source of truth so it cannot
    // drift from the install/update id used by the claude-plugin scaffolder.
    expect(settings.enabledPlugins[CLAUDE_PLUGIN_ID]).toBe(true)
  })

  it('re-enables Claude hooks in user settings without dropping unrelated plugin state', async () => {
    const userSettingsPath = join(repoRoot, '.home', '.claude', 'settings.json')
    mkdirSync(join(repoRoot, '.home', '.claude'), { recursive: true })
    writeFileSync(
      userSettingsPath,
      JSON.stringify(
        {
          disableAllHooks: true,
          enabledPlugins: {
            'playwright@claude-plugins-official': false,
            [CLAUDE_PLUGIN_ID]: false,
          },
        },
        null,
        2,
      ),
    )

    await scaffoldAgentHooks({ repoRoot, options: {} })

    const settings = JSON.parse(readFileSync(userSettingsPath, 'utf8')) as {
      disableAllHooks: boolean
      enabledPlugins: Record<string, boolean>
    }

    expect(settings.disableAllHooks).toBe(false)
    expect(settings.enabledPlugins[CLAUDE_PLUGIN_ID]).toBe(true)
    expect(settings.enabledPlugins['playwright@claude-plugins-official']).toBe(false)
  })

  it('preserves existing symlinkDirectories and adds .claude additively', async () => {
    const settingsPath = join(repoRoot, '.claude', 'settings.json')
    mkdirSync(join(repoRoot, '.claude'), { recursive: true })
    writeFileSync(
      settingsPath,
      JSON.stringify({ worktree: { symlinkDirectories: ['node_modules'] } }, null, 2),
    )

    await scaffoldAgentHooks({ repoRoot, options: {} })

    const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
      worktree: { symlinkDirectories: string[] }
    }
    expect(settings.worktree.symlinkDirectories).toEqual(['node_modules', '.claude'])
  })

  it('does not duplicate .claude in symlinkDirectories', async () => {
    const settingsPath = join(repoRoot, '.claude', 'settings.json')
    mkdirSync(join(repoRoot, '.claude'), { recursive: true })
    writeFileSync(
      settingsPath,
      JSON.stringify({ worktree: { symlinkDirectories: ['.claude'] } }, null, 2),
    )

    await scaffoldAgentHooks({ repoRoot, options: {} })

    const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
      worktree: { symlinkDirectories: string[] }
    }
    expect(settings.worktree.symlinkDirectories).toEqual(['.claude'])
  })

  it('does not create .claude/hooks in dry-run mode', async () => {
    await scaffoldAgentHooks({ repoRoot, options: { dryRun: true } })

    expect(() =>
      readFileSync(join(repoRoot, '.claude', 'hooks', 'check-gstack.sh'), 'utf8'),
    ).toThrow()
    expect(() =>
      readFileSync(
        join(repoRoot, '.claude', 'hooks', 'managed', 'wp-sessionstart-routing.sh'),
        'utf8',
      ),
    ).toThrow()
  })

  it('does not materialize gstack guard hooks unless gstack is enabled', async () => {
    await scaffoldAgentHooks({ repoRoot, options: {}, trustCodexHooks: false })

    expect(() =>
      readFileSync(join(repoRoot, '.claude', 'hooks', 'check-gstack.sh'), 'utf8'),
    ).toThrow()

    const settings = JSON.parse(
      readFileSync(join(repoRoot, '.claude', 'settings.json'), 'utf8'),
    ) as {
      hooks: {
        SessionStart?: Array<{ hooks: Array<{ command: string }> }>
        PreToolUse?: Array<{ hooks: Array<{ command: string }> }>
      }
    }
    const sessionCommands = (settings.hooks.SessionStart ?? []).flatMap((group) =>
      group.hooks.map((hook) => hook.command),
    )
    const preToolCommands = (settings.hooks.PreToolUse ?? []).flatMap((group) =>
      group.hooks.map((hook) => hook.command),
    )
    expect(sessionCommands.some((command) => command.includes('check-gstack-session.sh'))).toBe(
      false,
    )
    expect(preToolCommands.some((command) => command.includes('check-gstack.sh'))).toBe(false)
  })

  it('wires wp-sessionstart-routing as the SessionStart hook in both Claude and Codex', async () => {
    await scaffoldAgentHooks({ repoRoot, options: {}, gstackEnabled: true })

    const claude = JSON.parse(readFileSync(join(repoRoot, '.claude', 'settings.json'), 'utf8')) as {
      hooks: { SessionStart: Array<{ hooks: Array<{ command: string }> }> }
    }
    const codex = JSON.parse(readFileSync(join(repoRoot, '.codex', 'hooks.json'), 'utf8')) as {
      hooks: { SessionStart: Array<{ hooks: Array<{ command: string }> }> }
    }

    const claudeCommands = claude.hooks.SessionStart.flatMap((g) => g.hooks.map((h) => h.command))
    const codexCommands = codex.hooks.SessionStart.flatMap((g) => g.hooks.map((h) => h.command))

    expect(claudeCommands.some((cmd) => cmd.includes('wp-sessionstart-routing'))).toBe(true)
    expect(claudeCommands.some((cmd) => cmd.includes('$CLAUDE_PROJECT_DIR'))).toBe(true)
    expect(codexCommands).toContain(codexBinCommand(repoRoot, 'wp-sessionstart-routing'))
    expect(
      readFileSync(
        join(repoRoot, '.claude', 'hooks', 'managed', 'wp-sessionstart-routing.sh'),
        'utf8',
      ),
    ).toContain('bin/wp-sessionstart-routing.js')
    expect(
      readFileSync(join(repoRoot, '.codex', 'managed-hooks', 'wp-sessionstart-routing.sh'), 'utf8'),
    ).toContain('bin/wp-sessionstart-routing.js')
  })

  it('repairs managed hook launcher execute bits on repeated setup', async () => {
    await scaffoldAgentHooks({ repoRoot, options: {}, trustCodexHooks: false })

    const launcherPath = join(repoRoot, '.codex', 'managed-hooks', 'wp-sessionstart-routing.sh')
    chmodSync(launcherPath, 0o644)

    await scaffoldAgentHooks({ repoRoot, options: {}, trustCodexHooks: false })

    expect(() => accessSync(launcherPath, constants.X_OK)).not.toThrow()
  })

  it('uses direct managed hook binaries instead of shelling through global wp', async () => {
    mkdirSync(join(repoRoot, 'node_modules', '.bin'), { recursive: true })
    const shimPath = join(repoRoot, 'node_modules', '.bin', 'wp-guard-switch')
    writeFileSync(shimPath, '#!/bin/sh\nexit 42\n', 'utf8')
    chmodSync(shimPath, 0o755)

    await scaffoldAgentHooks({ repoRoot, options: {}, trustCodexHooks: false })

    const launcher = readFileSync(
      join(repoRoot, '.codex', 'managed-hooks', 'wp-guard-switch.sh'),
      'utf8',
    )
    expect(launcher).toContain('bin/wp-guard-switch.js')
    expect(launcher).not.toContain('exec wp hook guard-switch')
  })

  it('resolves the packaged hook-launcher root from PATH when moduleUrl is virtual', () => {
    const packageRoot = mkdtempSync(join(tmpdir(), 'wp-hook-launcher-root-'))
    try {
      mkdirSync(join(packageRoot, 'bin'), { recursive: true })
      writeFileSync(
        join(packageRoot, 'package.json'),
        JSON.stringify({ name: '@webpresso/agent-kit' }),
      )
      writeFileSync(join(packageRoot, 'bin', 'wp'), '')

      const resolved = resolvePackageRootForHookLaunchers({
        moduleUrl: 'file:///__bunfs__/root/wp',
        execPath: '/usr/bin/node',
        argv0: 'wp',
        argv1: 'setup',
        pathEnv: join(packageRoot, 'bin'),
      })

      expect(resolved).toBe(packageRoot)
    } finally {
      rmSync(packageRoot, { recursive: true, force: true })
    }
  })

  it('uses direct bin entrypoints in managed hook launchers', async () => {
    await scaffoldAgentHooks({ repoRoot, options: {}, trustCodexHooks: false })

    const guardLauncher = readFileSync(
      join(repoRoot, '.claude', 'hooks', 'managed', 'wp-pretool-guard.sh'),
      'utf8',
    )
    expect(guardLauncher).toContain('bin/wp-pretool-guard.js')
    expect(guardLauncher).toContain('exec ')
    expect(guardLauncher).not.toContain('exec wp hook pretool-guard')

    const sessionLauncher = readFileSync(
      join(repoRoot, '.claude', 'hooks', 'managed', 'wp-sessionstart-routing.sh'),
      'utf8',
    )
    expect(sessionLauncher).toContain('bin/wp-sessionstart-routing.js')
    expect(sessionLauncher).not.toContain('exec wp hook sessionstart-routing')
  })

  it('honors WP_HOOK_NODE_PATH when setup itself runs under a non-Node runtime', async () => {
    const fakeNode = join(repoRoot, 'toolchain', 'node')
    mkdirSync(join(repoRoot, 'toolchain'), { recursive: true })
    writeFileSync(fakeNode, '#!/bin/sh\nexit 0\n', 'utf8')
    chmodSync(fakeNode, 0o755)
    process.env.WP_HOOK_NODE_PATH = fakeNode

    await scaffoldAgentHooks({ repoRoot, options: {}, trustCodexHooks: false })

    const launcher = readFileSync(
      join(repoRoot, '.codex', 'managed-hooks', 'wp-sessionstart-routing.sh'),
      'utf8',
    )
    expect(resolveNodeBinaryForManagedHookLaunchers()).toBe(fakeNode)
    expect(launcher).toContain(`exec ${quoteShell(fakeNode)} `)
  })

  it('does not render local runtime or node_modules preambles', async () => {
    await scaffoldAgentHooks({ repoRoot, options: {}, trustCodexHooks: false })
    const guardLauncher = readFileSync(
      join(repoRoot, '.claude', 'hooks', 'managed', 'wp-pretool-guard.sh'),
      'utf8',
    )
    expect(guardLauncher).not.toContain('WP_BIN=')
    expect(guardLauncher).toContain('bin/wp-pretool-guard.js')
  })

  it('dedupes pre-existing wrapped script hooks against the raw incoming form', async () => {
    // Regression: hasCommand previously only extracted node_modules/.bin/<name>
    // identifiers. Script paths like .claude/hooks/check-gstack-session.sh
    // fell through to exact-string match, so the wrapped form
    // `[ -x X ] && X || true` did not match the raw incoming `X`. wp setup
    // accumulated a duplicate gstack entry on every run.
    const settingsPath = join(repoRoot, '.claude', 'settings.json')
    mkdirSync(join(repoRoot, '.claude'), { recursive: true })
    const wrappedGstack =
      '[ -x "$CLAUDE_PROJECT_DIR/.claude/hooks/check-gstack-session.sh" ] && "$CLAUDE_PROJECT_DIR/.claude/hooks/check-gstack-session.sh" || true'
    writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          hooks: {
            SessionStart: [{ hooks: [{ type: 'command', command: wrappedGstack, timeout: 2 }] }],
          },
        },
        null,
        2,
      ),
    )

    await scaffoldAgentHooks({ repoRoot, options: {}, gstackEnabled: true })

    const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
      hooks: { SessionStart: Array<{ hooks: Array<{ command: string }> }> }
    }
    const gstackMatches = settings.hooks.SessionStart.flatMap((g) =>
      g.hooks.map((h) => h.command),
    ).filter((cmd) => cmd.includes('check-gstack-session.sh'))
    expect(gstackMatches).toHaveLength(1)
    expect(gstackMatches[0]).toBe(wrappedGstack)
  })

  it('dedupes pre-existing wrapped Skill matcher hooks against the raw incoming form', async () => {
    const settingsPath = join(repoRoot, '.claude', 'settings.json')
    mkdirSync(join(repoRoot, '.claude'), { recursive: true })
    const wrappedGstackSkill =
      '[ -x "$CLAUDE_PROJECT_DIR/.claude/hooks/check-gstack.sh" ] && "$CLAUDE_PROJECT_DIR/.claude/hooks/check-gstack.sh" || true'
    writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          hooks: {
            PreToolUse: [
              {
                matcher: 'Skill',
                hooks: [{ type: 'command', command: wrappedGstackSkill, timeout: 3 }],
              },
            ],
          },
        },
        null,
        2,
      ),
    )

    await scaffoldAgentHooks({ repoRoot, options: {} })

    const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
      hooks: { PreToolUse: Array<{ matcher?: string; hooks: Array<{ command: string }> }> }
    }
    const gstackSkillMatches = settings.hooks.PreToolUse.flatMap((g) =>
      g.hooks.map((h) => h.command),
    ).filter((cmd) => cmd.includes('check-gstack.sh'))
    expect(gstackSkillMatches).toHaveLength(1)
  })

  it('rewrites stale Claude wp-pretool-guard wrappers to the managed fail-closed form without duplicates', async () => {
    const settingsPath = join(repoRoot, '.claude', 'settings.json')
    mkdirSync(join(repoRoot, '.claude'), { recursive: true })
    const staleGuard =
      '[ -x "$CLAUDE_PROJECT_DIR/node_modules/.bin/wp-pretool-guard" ] && "$CLAUDE_PROJECT_DIR/node_modules/.bin/wp-pretool-guard" || true'
    const staleDirectGuard =
      'export PATH="$HOME/.vite-plus/bin:$PATH"; if command -v wp >/dev/null 2>&1; then wp hook pretool-guard; else true; fi'
    writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          hooks: {
            PreToolUse: [
              {
                matcher: 'Bash|Write|Edit|MultiEdit',
                hooks: [
                  { type: 'command', command: staleGuard, timeout: 5 },
                  { type: 'command', command: staleDirectGuard, timeout: 5 },
                ],
              },
            ],
          },
        },
        null,
        2,
      ),
    )

    await scaffoldAgentHooks({ repoRoot, options: {} })

    const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
      hooks: { PreToolUse: Array<{ matcher?: string; hooks: Array<{ command: string }> }> }
    }
    const wpPretoolGuards = settings.hooks.PreToolUse.flatMap((group) =>
      group.hooks.map((hook) => hook.command),
    ).filter((command) => command.includes('wp-pretool-guard'))

    expect(wpPretoolGuards).toStrictEqual([claudeBinCommand('wp-pretool-guard')])
  })

  it('does not duplicate the wp-sessionstart-routing entry on a second scaffold', async () => {
    await scaffoldAgentHooks({ repoRoot, options: {} })
    await scaffoldAgentHooks({ repoRoot, options: {} })

    const codex = JSON.parse(readFileSync(join(repoRoot, '.codex', 'hooks.json'), 'utf8')) as {
      hooks: { SessionStart: Array<{ hooks: Array<{ command: string }> }> }
    }

    const matches = codex.hooks.SessionStart.flatMap((g) => g.hooks.map((h) => h.command)).filter(
      (cmd) => cmd.includes('wp-sessionstart-routing'),
    )
    expect(matches).toHaveLength(1)
  })

  it('invokes app-server trust sync only after .codex/hooks.json exists', async () => {
    const hooksPath = join(repoRoot, '.codex', 'hooks.json')
    const observedHooksFilePresence: boolean[] = []
    const { api, batchWrites, hooksListCalls } = createFakeCodexAppServer([
      {
        data: [
          {
            cwd: repoRoot,
            hooks: [
              {
                key: `${hooksPath}:pre_tool_use:0:0`,
                eventName: 'pre_tool_use',
                handlerType: 'command',
                matcher: 'Bash',
                command: './.codex/managed-hooks/wp-pretool-guard.sh',
                timeoutSec: 5,
                statusMessage: null,
                sourcePath: hooksPath,
                source: 'project',
                pluginId: null,
                displayOrder: 0,
                enabled: true,
                isManaged: false,
                currentHash: 'sha256:abc123',
                trustStatus: 'untrusted',
              },
            ],
            warnings: [],
            errors: [],
          },
        ],
      },
      {
        data: [
          {
            cwd: repoRoot,
            hooks: [
              {
                key: `${hooksPath}:pre_tool_use:0:0`,
                eventName: 'pre_tool_use',
                handlerType: 'command',
                matcher: 'Bash',
                command: './.codex/managed-hooks/wp-pretool-guard.sh',
                timeoutSec: 5,
                statusMessage: null,
                sourcePath: hooksPath,
                source: 'project',
                pluginId: null,
                displayOrder: 0,
                enabled: true,
                isManaged: false,
                currentHash: 'sha256:abc123',
                trustStatus: 'trusted',
              },
            ],
            warnings: [],
            errors: [],
          },
        ],
      },
    ])

    await scaffoldAgentHooks({
      repoRoot,
      options: {},
      createCodexAppServer: async () => {
        observedHooksFilePresence.push(existsSync(hooksPath))
        return api
      },
    })

    expect(observedHooksFilePresence).toStrictEqual([true])
    expect(hooksListCalls).toStrictEqual([[repoRoot], [repoRoot]])
    expect(batchWrites).toStrictEqual([
      {
        edits: [
          {
            keyPath: 'hooks.state',
            value: {
              [`${hooksPath}:pre_tool_use:0:0`]: { enabled: true, trusted_hash: 'sha256:abc123' },
            },
            mergeStrategy: 'upsert',
          },
        ],
        filePath: expect.any(String),
        reloadUserConfig: true,
      },
    ])
  })

  it('does not write trust state when no owned hooks are discovered', async () => {
    const hooksPath = join(repoRoot, '.codex', 'hooks.json')
    const { api, batchWrites } = createFakeCodexAppServer([
      {
        data: [
          {
            cwd: repoRoot,
            hooks: [
              {
                key: `${hooksPath}:pre_tool_use:0:0`,
                eventName: 'pre_tool_use',
                handlerType: 'command',
                matcher: 'Bash',
                command: 'python hooks.py',
                timeoutSec: 5,
                statusMessage: null,
                sourcePath: hooksPath,
                source: 'project',
                pluginId: null,
                displayOrder: 0,
                enabled: true,
                isManaged: false,
                currentHash: 'sha256:abc123',
                trustStatus: 'untrusted',
              },
            ],
            warnings: [],
            errors: [],
          },
        ],
      },
    ])

    await scaffoldAgentHooks({ repoRoot, options: {}, createCodexAppServer: async () => api })

    expect(batchWrites).toStrictEqual([])
  })

  it('can write hook files without starting Codex trust sync', async () => {
    await scaffoldAgentHooks({
      repoRoot,
      options: {},
      trustCodexHooks: false,
      createCodexAppServer: async () => {
        throw new Error('should not start Codex app-server')
      },
    })

    expect(existsSync(join(repoRoot, '.codex', 'hooks.json'))).toBe(true)
  })

  it('does not start the real Codex app-server from Vitest scaffolding paths', async () => {
    const previousVitest = process.env.VITEST
    process.env.VITEST = 'true'
    const warnings: unknown[] = []
    try {
      await scaffoldAgentHooks({
        repoRoot,
        options: {},
        onCodexTrustSyncWarning: (warning) => warnings.push(warning),
      })
    } finally {
      if (previousVitest === undefined) delete process.env.VITEST
      else process.env.VITEST = previousVitest
    }

    expect(existsSync(join(repoRoot, '.codex', 'hooks.json'))).toBe(true)
    expect(warnings).toStrictEqual([])
  })

  it('can refresh Codex trust state after a later setup step rewrites hook state', async () => {
    const hooksPath = join(repoRoot, '.codex', 'hooks.json')
    const { api, batchWrites } = createFakeCodexAppServer([
      {
        data: [
          {
            cwd: repoRoot,
            hooks: [
              {
                key: `${hooksPath}:pre_tool_use:0:0`,
                eventName: 'pre_tool_use',
                handlerType: 'command',
                matcher: 'Bash',
                command: './.codex/managed-hooks/wp-pretool-guard.sh',
                timeoutSec: 5,
                statusMessage: null,
                sourcePath: hooksPath,
                source: 'project',
                pluginId: null,
                displayOrder: 0,
                enabled: true,
                isManaged: false,
                currentHash: 'sha256:abc123',
                trustStatus: 'untrusted',
              },
            ],
            warnings: [],
            errors: [],
          },
        ],
      },
      {
        data: [
          {
            cwd: repoRoot,
            hooks: [
              {
                key: `${hooksPath}:pre_tool_use:0:0`,
                eventName: 'pre_tool_use',
                handlerType: 'command',
                matcher: 'Bash',
                command: './.codex/managed-hooks/wp-pretool-guard.sh',
                timeoutSec: 5,
                statusMessage: null,
                sourcePath: hooksPath,
                source: 'project',
                pluginId: null,
                displayOrder: 0,
                enabled: true,
                isManaged: false,
                currentHash: 'sha256:abc123',
                trustStatus: 'trusted',
              },
            ],
            warnings: [],
            errors: [],
          },
        ],
      },
    ])

    await scaffoldAgentHooks({
      repoRoot,
      options: {},
      createCodexAppServer: async () => ({
        async hooksList() {
          return { data: [{ cwd: repoRoot, hooks: [], warnings: [], errors: [] }] }
        },
        async configBatchWrite() {
          return {}
        },
        close() {},
      }),
    })
    await trustCodexWebpressoHooksForRepo({
      repoRoot,
      options: {},
      createCodexAppServer: async () => api,
    })

    expect(batchWrites).toHaveLength(1)
  })

  it('refreshes only OMX preset-owned global Codex hooks after setup rewrites ~/.codex/hooks.json', async () => {
    const globalHooksPath = join(repoRoot, '.codex-home', 'hooks.json')
    mkdirSync(join(repoRoot, '.codex-home'), { recursive: true })
    writeFileSync(globalHooksPath, JSON.stringify({ hooks: {} }, null, 2))

    const { api, batchWrites, hooksListCalls } = createFakeCodexAppServer([
      {
        data: [
          {
            cwd: repoRoot,
            hooks: [
              {
                key: `${globalHooksPath}:pre_tool_use:0:0`,
                eventName: 'pre_tool_use',
                handlerType: 'command',
                matcher: 'Bash',
                command: 'node "/tmp/legacy-codex-hook.js"',
                timeoutSec: 5,
                statusMessage: null,
                sourcePath: globalHooksPath,
                source: 'user',
                pluginId: null,
                displayOrder: 0,
                enabled: true,
                isManaged: false,
                currentHash: 'sha256:ctx123',
                trustStatus: 'modified',
              },
              {
                key: `${globalHooksPath}:pre_tool_use:1:0`,
                eventName: 'pre_tool_use',
                handlerType: 'command',
                matcher: 'Bash',
                command: '"/Users/test/.codex/managed-hooks/wp-global-codex-omx-hook.sh"',
                timeoutSec: 5,
                statusMessage: null,
                sourcePath: globalHooksPath,
                source: 'user',
                pluginId: null,
                displayOrder: 1,
                enabled: true,
                isManaged: false,
                currentHash: 'sha256:omx123',
                trustStatus: 'modified',
              },
            ],
            warnings: [],
            errors: [],
          },
        ],
      },
      {
        data: [
          {
            cwd: repoRoot,
            hooks: [
              {
                key: `${globalHooksPath}:pre_tool_use:0:0`,
                eventName: 'pre_tool_use',
                handlerType: 'command',
                matcher: 'Bash',
                command: 'node "/tmp/legacy-codex-hook.js"',
                timeoutSec: 5,
                statusMessage: null,
                sourcePath: globalHooksPath,
                source: 'user',
                pluginId: null,
                displayOrder: 0,
                enabled: true,
                isManaged: false,
                currentHash: 'sha256:ctx123',
                trustStatus: 'trusted',
              },
              {
                key: `${globalHooksPath}:pre_tool_use:1:0`,
                eventName: 'pre_tool_use',
                handlerType: 'command',
                matcher: 'Bash',
                command: '"/Users/test/.codex/managed-hooks/wp-global-codex-omx-hook.sh"',
                timeoutSec: 5,
                statusMessage: null,
                sourcePath: globalHooksPath,
                source: 'user',
                pluginId: null,
                displayOrder: 1,
                enabled: true,
                isManaged: false,
                currentHash: 'sha256:omx123',
                trustStatus: 'trusted',
              },
            ],
            warnings: [],
            errors: [],
          },
        ],
      },
    ])

    await trustCodexPresetHooksForUser({
      repoRoot,
      options: {},
      createCodexAppServer: async () => api,
    })

    expect(hooksListCalls).toStrictEqual([[repoRoot], [repoRoot]])
    expect(batchWrites).toStrictEqual([
      {
        edits: [
          {
            keyPath: 'hooks.state',
            value: {
              [`${globalHooksPath}:pre_tool_use:1:0`]: {
                enabled: true,
                trusted_hash: 'sha256:omx123',
              },
            },
            mergeStrategy: 'upsert',
          },
        ],
        filePath: expect.any(String),
        reloadUserConfig: true,
      },
    ])
  })

  it('uses broad Claude context-heavy PreToolUse/PostToolUse matchers', async () => {
    await scaffoldAgentHooks({ repoRoot, options: {} })

    const settings = JSON.parse(
      readFileSync(join(repoRoot, '.claude', 'settings.json'), 'utf8'),
    ) as {
      hooks: {
        PreToolUse: Array<{ matcher?: string }>
        PostToolUse: Array<{ matcher?: string }>
      }
    }

    expect(
      settings.hooks.PreToolUse.some(
        (group) => group.matcher === 'Bash|Read|Grep|WebFetch|Agent|Write|Edit|MultiEdit|mcp__.*',
      ),
    ).toBe(true)
    expect(
      settings.hooks.PostToolUse.some(
        (group) => group.matcher === 'Bash|Read|Grep|WebFetch|Agent|Write|Edit|MultiEdit|mcp__.*',
      ),
    ).toBe(true)
    expect('PostToolBatch' in settings.hooks).toBe(false)
  })

  it('merges verify skill Stop hooks alongside the global Stop hook', async () => {
    const verifySkillDir = join(repoRoot, '.agent', 'skills', 'verify')
    mkdirSync(verifySkillDir, { recursive: true })
    writeFileSync(
      join(verifySkillDir, 'SKILL.md'),
      `---
name: verify
hooks:
  Stop:
    - command: wp audit agents
---

# Verify
`,
    )

    await scaffoldAgentHooks({ repoRoot, options: {} })

    const settings = JSON.parse(
      readFileSync(join(repoRoot, '.claude', 'settings.json'), 'utf8'),
    ) as {
      hooks: {
        Stop: Array<{ hooks: Array<{ command: string }> }>
      }
    }

    const stopCommands = settings.hooks.Stop.flatMap((group) =>
      group.hooks.map((hook) => hook.command),
    )
    expect(stopCommands.some((command) => command.includes('wp-stop-qa'))).toBe(true)
    // BP1: skill commands resolve wp via the launcher chain (project bin →
    // package-root fallback) instead of the bare project bin invocation.
    expect(
      stopCommands.some(
        (command) =>
          command.includes('wp audit agents') && command.includes('# from-skill: verify'),
      ),
    ).toBe(true)
    expect(stopCommands.some((command) => command.includes('# from-skill: verify'))).toBe(true)
  })

  it('preserves verify skill Stop hooks on a second run', async () => {
    const verifySkillDir = join(repoRoot, '.agent', 'skills', 'verify')
    mkdirSync(verifySkillDir, { recursive: true })
    writeFileSync(
      join(verifySkillDir, 'SKILL.md'),
      `---
name: verify
hooks:
  Stop:
    - command: wp audit agents
      timeout: 20
---

# Verify
`,
    )

    await scaffoldAgentHooks({ repoRoot, options: {} })
    await scaffoldAgentHooks({ repoRoot, options: {} })

    const settings = JSON.parse(
      readFileSync(join(repoRoot, '.claude', 'settings.json'), 'utf8'),
    ) as {
      hooks: {
        Stop: Array<{ hooks: Array<{ command: string }> }>
      }
    }

    const stopCommands = settings.hooks.Stop.flatMap((group) =>
      group.hooks.map((hook) => hook.command),
    )
    expect(stopCommands.some((command) => command.includes('wp-stop-qa'))).toBe(true)
    expect(stopCommands.some((command) => command.includes('# from-skill: verify'))).toBe(true)
  })

  it('keeps skill-managed Stop wp commands quiet on stdout', async () => {
    const verifySkillDir = join(repoRoot, '.agent', 'skills', 'verify')
    mkdirSync(verifySkillDir, { recursive: true })
    writeFileSync(
      join(verifySkillDir, 'SKILL.md'),
      `---
name: verify
hooks:
  Stop:
    - command: wp audit agents
      timeout: 20
---

# Verify
`,
    )

    const binDir = join(repoRoot, 'node_modules', '.bin')
    mkdirSync(binDir, { recursive: true })
    const wpBin = join(binDir, 'wp')
    writeFileSync(wpBin, '#!/bin/sh\necho "Agent surfaces: OK (3 checked)"\n')
    chmodSync(wpBin, 0o755)

    await scaffoldAgentHooks({ repoRoot, options: {} })

    const settings = JSON.parse(
      readFileSync(join(repoRoot, '.claude', 'settings.json'), 'utf8'),
    ) as {
      hooks: {
        Stop: Array<{ hooks: Array<{ command: string }> }>
      }
    }
    const command = settings.hooks.Stop.flatMap((group) => group.hooks)
      .map((hook) => hook.command)
      .find((candidate) => candidate.includes('# from-skill: verify'))

    expect(command).toContain('# from-skill: verify')
    const result = spawnSync('sh', ['-c', command ?? ''], {
      cwd: repoRoot,
      env: { ...process.env, CLAUDE_PROJECT_DIR: repoRoot },
      encoding: 'utf8',
    })

    expect(result.stdout).toBe('')
  })

  it('prunes stale legacy Claude ak-* hook commands while preserving unrelated hooks', async () => {
    const settingsPath = join(repoRoot, '.claude', 'settings.json')
    mkdirSync(join(repoRoot, '.claude'), { recursive: true })
    writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          hooks: {
            SessionStart: [
              {
                hooks: [
                  {
                    type: 'command',
                    command: '"$CLAUDE_PROJECT_DIR/node_modules/.bin/ak-sessionstart-routing"',
                    timeout: 5,
                  },
                ],
              },
              {
                hooks: [{ type: 'command', command: 'echo keep-session-start', timeout: 1 }],
              },
            ],
            PreToolUse: [
              {
                matcher: 'Bash|Write|Edit',
                hooks: [
                  {
                    type: 'command',
                    command:
                      '[ -x "$CLAUDE_PROJECT_DIR/node_modules/.bin/ak-pretool-guard" ] && "$CLAUDE_PROJECT_DIR/node_modules/.bin/ak-pretool-guard" || true',
                    timeout: 5,
                  },
                ],
              },
            ],
            PostToolUse: [
              {
                matcher: 'Write|Edit',
                hooks: [
                  {
                    type: 'command',
                    command: '"$CLAUDE_PROJECT_DIR/node_modules/.bin/ak-post-tool"',
                    timeout: 15,
                  },
                ],
              },
            ],
            UserPromptSubmit: [
              {
                hooks: [
                  {
                    type: 'command',
                    command: '"$CLAUDE_PROJECT_DIR/node_modules/.bin/ak-guard-switch"',
                    timeout: 5,
                  },
                ],
              },
            ],
            Stop: [
              {
                hooks: [
                  {
                    type: 'command',
                    command: '"$CLAUDE_PROJECT_DIR/node_modules/.bin/ak-stop-qa"',
                  },
                ],
              },
            ],
          },
        },
        null,
        2,
      ),
    )

    await scaffoldAgentHooks({ repoRoot, options: {} })

    const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>
    }

    const allCommands = Object.values(settings.hooks).flatMap((groups) =>
      groups.flatMap((group) => group.hooks.map((hook) => hook.command)),
    )

    expect(allCommands.some((command) => command.includes('node_modules/.bin/ak-'))).toBe(false)
    expect(allCommands).toContain('echo keep-session-start')
    expect(allCommands.some((command) => command.includes('wp-sessionstart-routing'))).toBe(true)
    expect(allCommands.some((command) => command.includes('wp-pretool-guard'))).toBe(true)
    expect(allCommands.some((command) => command.includes('wp-post-tool'))).toBe(true)
    expect(allCommands.some((command) => command.includes('wp-guard-switch'))).toBe(true)
    expect(allCommands.some((command) => command.includes('wp-stop-qa'))).toBe(true)
  })

  it('prunes stale legacy wrapped Codex ak-* hook commands while preserving unrelated hooks', async () => {
    const codexPath = join(repoRoot, '.codex', 'hooks.json')
    mkdirSync(join(repoRoot, '.codex'), { recursive: true })
    writeFileSync(
      codexPath,
      JSON.stringify(
        {
          hooks: {
            SessionStart: [
              {
                hooks: [
                  {
                    type: 'command',
                    command: './node_modules/.bin/ak-sessionstart-routing',
                    timeout: 5,
                  },
                ],
              },
              {
                hooks: [{ type: 'command', command: 'echo keep-codex-session', timeout: 1 }],
              },
            ],
            PreToolUse: [
              {
                matcher: 'Bash|Write|Edit',
                hooks: [
                  {
                    type: 'command',
                    command:
                      '[ -x ./node_modules/.bin/ak-pretool-guard ] && ./node_modules/.bin/ak-pretool-guard || true',
                    timeout: 5,
                  },
                ],
              },
              {
                matcher: 'Bash',
                hooks: [
                  {
                    type: 'command',
                    command: './node_modules/.bin/not-webpresso',
                    timeout: 5,
                  },
                ],
              },
            ],
            CustomEvent: [
              {
                hooks: [
                  {
                    type: 'command',
                    command: './node_modules/.bin/wp-pretool-guard',
                    timeout: 123,
                  },
                  {
                    type: 'command',
                    command: 42,
                  },
                ],
              },
            ],
            LegacyOnlyCustomEvent: [
              {
                hooks: [
                  {
                    type: 'command',
                    command: './node_modules/.bin/ak-pretool-guard',
                  },
                ],
              },
            ],
          },
        },
        null,
        2,
      ),
    )

    await scaffoldAgentHooks({
      repoRoot,
      options: {},
      gstackEnabled: true,
      trustCodexHooks: false,
    })

    const codex = JSON.parse(readFileSync(codexPath, 'utf8')) as {
      hooks: Record<string, Array<{ hooks: Array<{ command: unknown; timeout?: number }> }>>
    }
    const allCommands = Object.values(codex.hooks).flatMap((groups) =>
      groups.flatMap((group) => group.hooks.map((hook) => hook.command)),
    )
    const customCommands = codex.hooks.CustomEvent.flatMap((group) =>
      group.hooks.map((hook) => hook.command),
    )
    const preToolUseCommands = codex.hooks.PreToolUse.flatMap((group) =>
      group.hooks.map((hook) => hook.command),
    )

    expect(
      allCommands.filter(
        (command) => typeof command === 'string' && command.includes('node_modules/.bin/ak-'),
      ),
    ).toEqual([])
    expect(allCommands).toContain('echo keep-codex-session')
    expect(allCommands).toContain('./node_modules/.bin/not-webpresso')
    expect(customCommands).toStrictEqual([42])
    expect(codex.hooks.LegacyOnlyCustomEvent).toBe(undefined)
    expect(
      allCommands.filter(
        (command) => command === codexBinCommand(repoRoot, 'wp-sessionstart-routing'),
      ),
    ).toHaveLength(1)
    expect(
      preToolUseCommands.filter(
        (command) => command === codexBinCommand(repoRoot, 'wp-pretool-guard'),
      ),
    ).toHaveLength(1)
  })

  it('prunes stale legacy flat-form Codex ak-* hook commands during wrapped migration', async () => {
    const codexPath = join(repoRoot, '.codex', 'hooks.json')
    mkdirSync(join(repoRoot, '.codex'), { recursive: true })
    writeFileSync(
      codexPath,
      JSON.stringify(
        {
          SessionStart: [
            {
              hooks: [
                {
                  type: 'command',
                  command: './node_modules/.bin/ak-sessionstart-routing',
                  timeout: 5,
                },
              ],
            },
          ],
          PreToolUse: [
            {
              matcher: 'Bash|Edit|Write',
              hooks: [
                { type: 'command', command: './node_modules/.bin/ak-pretool-guard', timeout: 5 },
              ],
            },
          ],
        },
        null,
        2,
      ),
    )

    await scaffoldAgentHooks({
      repoRoot,
      options: {},
      gstackEnabled: true,
      trustCodexHooks: false,
    })

    const codex = JSON.parse(readFileSync(codexPath, 'utf8')) as {
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>
      SessionStart?: unknown
      PreToolUse?: unknown
    }
    const allCommands = Object.values(codex.hooks).flatMap((groups) =>
      groups.flatMap((group) => group.hooks.map((hook) => hook.command)),
    )

    expect(codex.SessionStart).toBe(undefined)
    expect(codex.PreToolUse).toBe(undefined)
    expect(allCommands.filter((command) => command.includes('node_modules/.bin/ak-'))).toEqual([])
    expect(
      allCommands.filter(
        (command) => command === codexBinCommand(repoRoot, 'wp-sessionstart-routing'),
      ),
    ).toHaveLength(1)
    expect(
      allCommands.filter((command) => command === codexBinCommand(repoRoot, 'wp-pretool-guard')),
    ).toHaveLength(1)
  })

  it('converges dirty Claude and Codex hook surfaces before Codex trust sync observes hooks', async () => {
    const claudePath = join(repoRoot, '.claude', 'settings.json')
    const codexPath = join(repoRoot, '.codex', 'hooks.json')
    mkdirSync(join(repoRoot, '.claude'), { recursive: true })
    mkdirSync(join(repoRoot, '.codex'), { recursive: true })
    writeFileSync(
      claudePath,
      JSON.stringify(
        {
          hooks: {
            PreToolUse: [
              {
                matcher: 'Bash',
                hooks: [
                  {
                    type: 'command',
                    command: '"$CLAUDE_PROJECT_DIR/node_modules/.bin/ak-pretool-guard"',
                  },
                ],
              },
            ],
          },
        },
        null,
        2,
      ),
    )
    writeFileSync(
      codexPath,
      JSON.stringify(
        {
          hooks: {
            PreToolUse: [
              {
                matcher: 'Bash',
                hooks: [
                  { type: 'command', command: './node_modules/.bin/ak-pretool-guard' },
                  { type: 'command', command: './node_modules/.bin/wp-pretool-guard' },
                ],
              },
            ],
          },
        },
        null,
        2,
      ),
    )

    const observedCodexCommands: string[][] = []
    let hooksListCount = 0
    const api = {
      async hooksList() {
        hooksListCount += 1
        const codex = JSON.parse(readFileSync(codexPath, 'utf8')) as {
          hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>
        }
        const commands = Object.values(codex.hooks).flatMap((groups) =>
          groups.flatMap((group) => group.hooks.map((hook) => hook.command)),
        )
        observedCodexCommands.push(commands)
        return {
          data: [
            {
              cwd: repoRoot,
              hooks: commands.map((command, index) => ({
                key: `${codexPath}:command:${index}`,
                eventName: 'pre_tool_use',
                handlerType: 'command',
                matcher: 'Bash',
                command,
                timeoutSec: 5,
                statusMessage: null,
                sourcePath: codexPath,
                source: 'project',
                pluginId: null,
                displayOrder: index,
                enabled: true,
                isManaged: false,
                currentHash: `sha256:${index}`,
                trustStatus: hooksListCount === 1 ? 'untrusted' : 'trusted',
              })),
              warnings: [],
              errors: [],
            },
          ],
        }
      },
      async configBatchWrite() {
        return {}
      },
      close() {},
    }

    await scaffoldAgentHooks({
      repoRoot,
      options: {},
      createCodexAppServer: async () => api,
    })

    const firstClaude = readFileSync(claudePath, 'utf8')
    const firstCodex = readFileSync(codexPath, 'utf8')

    await scaffoldAgentHooks({ repoRoot, options: {}, trustCodexHooks: false })

    expect(readFileSync(claudePath, 'utf8')).toBe(firstClaude)
    expect(readFileSync(codexPath, 'utf8')).toBe(firstCodex)
    expect(
      observedCodexCommands.flat().filter((command) => command.includes('node_modules/.bin/ak-')),
    ).toEqual([])
    expect(firstClaude).not.toContain('node_modules/.bin/ak-')
    expect(firstCodex).not.toContain('node_modules/.bin/ak-')
  })

  it('removes stale skill-managed hooks when the skill is no longer installed', async () => {
    const settingsPath = join(repoRoot, '.claude', 'settings.json')
    mkdirSync(join(repoRoot, '.claude'), { recursive: true })
    writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          hooks: {
            Stop: [
              {
                hooks: [
                  {
                    type: 'command',
                    command:
                      '[ -x "$CLAUDE_PROJECT_DIR/node_modules/.bin/wp" ] && "$CLAUDE_PROJECT_DIR/node_modules/.bin/wp" audit agents || true # from-skill: verify',
                  },
                ],
              },
            ],
          },
        },
        null,
        2,
      ),
    )

    await scaffoldAgentHooks({ repoRoot, options: {} })

    const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
      hooks: {
        Stop: Array<{ hooks: Array<{ command: string }> }>
      }
    }
    const stopCommands = settings.hooks.Stop.flatMap((group) =>
      group.hooks.map((hook) => hook.command),
    )

    expect(stopCommands.some((command) => command.includes('# from-skill: verify'))).toBe(false)
    expect(stopCommands.some((command) => command.includes('wp-stop-qa'))).toBe(true)
  })

  it('writes Codex hooks under the canonical wrapped `hooks` key, not at top level', async () => {
    await scaffoldAgentHooks({ repoRoot, options: {} })

    const codex = JSON.parse(
      readFileSync(join(repoRoot, '.codex', 'hooks.json'), 'utf8'),
    ) as Record<string, unknown>

    expect(codex).toHaveProperty('hooks')
    expect(codex).not.toHaveProperty('SessionStart')
    expect(codex).not.toHaveProperty('PreToolUse')
    expect(codex).not.toHaveProperty('PostToolUse')

    const hooks = codex.hooks as {
      SessionStart: Array<{ hooks: Array<{ command: string }> }>
      PreToolUse: Array<{ matcher?: string; hooks: Array<{ command: string }> }>
    }
    expect(
      hooks.SessionStart.some((g) =>
        g.hooks.some((h) => h.command.includes('wp-sessionstart-routing')),
      ),
    ).toBe(true)
    expect(
      hooks.PreToolUse.some((g) => g.hooks.some((h) => h.command.includes('wp-pretool-guard'))),
    ).toBe(true)
  })

  it('migrates legacy flat-form Codex hooks.json into the wrapped `hooks` key', async () => {
    const codexPath = join(repoRoot, '.codex', 'hooks.json')
    mkdirSync(join(repoRoot, '.codex'), { recursive: true })
    writeFileSync(
      codexPath,
      JSON.stringify(
        {
          SessionStart: [
            {
              hooks: [
                {
                  type: 'command',
                  command: './node_modules/.bin/wp-sessionstart-routing',
                  timeout: 5,
                },
              ],
            },
          ],
          PreToolUse: [
            {
              matcher: 'Bash|Edit|Write',
              hooks: [
                { type: 'command', command: './node_modules/.bin/wp-pretool-guard', timeout: 5 },
              ],
            },
          ],
        },
        null,
        2,
      ),
    )

    await scaffoldAgentHooks({ repoRoot, options: {} })

    const codex = JSON.parse(readFileSync(codexPath, 'utf8')) as Record<string, unknown>
    expect(codex).not.toHaveProperty('SessionStart')
    expect(codex).not.toHaveProperty('PreToolUse')
    expect(codex).toHaveProperty('hooks')

    const hooks = codex.hooks as {
      SessionStart: Array<{ hooks: Array<{ command: string }> }>
      PreToolUse: Array<{ matcher?: string; hooks: Array<{ command: string }> }>
    }
    // No duplication — ensureGroup deduped the migrated entries with what we re-add.
    const sessionCmds = hooks.SessionStart.flatMap((g) => g.hooks.map((h) => h.command))
    const sessionAkCount = sessionCmds.filter((c) => c.includes('wp-sessionstart-routing')).length
    expect(sessionAkCount).toBe(1)
    expect(
      hooks.PreToolUse.find((g) => g.hooks.some((h) => h.command.includes('wp-pretool-guard')))
        ?.matcher,
    ).toBe('Bash|apply_patch|Edit|Write|mcp__.*')
  })

  it('rewrites wrapped Codex OMX hooks to the managed launcher family and adds wp-* alongside', async () => {
    const codexPath = join(repoRoot, '.codex', 'hooks.json')
    mkdirSync(join(repoRoot, '.codex'), { recursive: true })
    writeFileSync(
      codexPath,
      JSON.stringify(
        {
          hooks: {
            SessionStart: [
              {
                matcher: 'startup|resume',
                hooks: [{ type: 'command', command: 'node /opt/omx/codex-native-hook.js' }],
              },
            ],
          },
        },
        null,
        2,
      ),
    )

    await scaffoldAgentHooks({ repoRoot, options: {} })

    const codex = JSON.parse(readFileSync(codexPath, 'utf8')) as {
      hooks: { SessionStart: Array<{ hooks: Array<{ command: string }> }> }
    }
    const sessionCmds = codex.hooks.SessionStart.flatMap((g) => g.hooks.map((h) => h.command))
    expect(sessionCmds.some((c) => c.includes('codex-native-hook'))).toBe(false)
    expect(
      sessionCmds.some((c) => c.includes('.codex/managed-hooks/wp-global-codex-omx-hook.sh')),
    ).toBe(true)
    expect(sessionCmds).toContain(codexBinCommand(repoRoot, 'wp-sessionstart-routing'))
    expect(
      readFileSync(
        join(repoRoot, '.codex', 'managed-hooks', 'wp-global-codex-omx-hook.sh'),
        'utf8',
      ),
    ).toContain('exec ')
  })

  it('rewrites Codex Stop OMX hooks to the JSON-only managed launcher', async () => {
    const codexPath = join(repoRoot, '.codex', 'hooks.json')
    mkdirSync(join(repoRoot, '.codex'), { recursive: true })
    writeFileSync(
      codexPath,
      JSON.stringify(
        {
          hooks: {
            Stop: [
              {
                hooks: [{ type: 'command', command: 'node /opt/omx/codex-native-hook.js' }],
              },
            ],
          },
        },
        null,
        2,
      ),
    )

    await scaffoldAgentHooks({ repoRoot, options: {} })

    const codex = JSON.parse(readFileSync(codexPath, 'utf8')) as {
      hooks: { Stop: Array<{ hooks: Array<{ command: string }> }> }
    }
    const stopCommands = codex.hooks.Stop.flatMap((g) => g.hooks.map((h) => h.command))
    expect(stopCommands.some((c) => c.includes('codex-native-hook'))).toBe(false)
    expect(
      stopCommands.some((c) => c.includes('.codex/managed-hooks/wp-global-codex-omx-json-hook.sh')),
    ).toBe(true)
    expect(
      readFileSync(
        join(repoRoot, '.codex', 'managed-hooks', 'wp-global-codex-omx-json-hook.sh'),
        'utf8',
      ),
    ).toContain(`printf '%s\\n' '{}'`)
  })

  it('rewrites live-style Codex Stop OMX hooks with OMX_ROOT and absolute node paths', async () => {
    const codexPath = join(repoRoot, '.codex', 'hooks.json')
    mkdirSync(join(repoRoot, '.codex'), { recursive: true })
    writeFileSync(
      codexPath,
      JSON.stringify(
        {
          hooks: {
            Stop: [
              {
                hooks: [
                  {
                    type: 'command',
                    command: `OMX_ROOT="${repoRoot}" "${process.execPath}" "/Users/test/.vite-plus/packages/oh-my-codex/lib/node_modules/oh-my-codex/dist/scripts/codex-native-hook.js"`,
                  },
                ],
              },
            ],
          },
        },
        null,
        2,
      ),
    )

    await scaffoldAgentHooks({ repoRoot, options: {} })

    const codex = JSON.parse(readFileSync(codexPath, 'utf8')) as {
      hooks: { Stop: Array<{ hooks: Array<{ command: string }> }> }
    }
    const stopCommands = codex.hooks.Stop.flatMap((group) =>
      group.hooks.map((hook) => hook.command),
    )
    expect(stopCommands.some((command) => command.includes('codex-native-hook'))).toBe(false)
    expect(
      stopCommands.some((command) =>
        command.includes('.codex/managed-hooks/wp-global-codex-omx-json-hook.sh'),
      ),
    ).toBe(true)
  })

  it('writes Codex hook commands as managed local launchers', async () => {
    await scaffoldAgentHooks({ repoRoot, options: {} })

    const codex = JSON.parse(readFileSync(join(repoRoot, '.codex', 'hooks.json'), 'utf8')) as {
      hooks: {
        SessionStart: Array<{ hooks: Array<{ command: string }> }>
        PreToolUse: Array<{ hooks: Array<{ command: string }> }>
        PostToolUse: Array<{ hooks: Array<{ command: string }> }>
      }
    }

    const sessionCommands = codex.hooks.SessionStart.flatMap((g) => g.hooks.map((h) => h.command))
    const preToolCommands = codex.hooks.PreToolUse.flatMap((g) => g.hooks.map((h) => h.command))
    const postToolCommands = codex.hooks.PostToolUse.flatMap((g) => g.hooks.map((h) => h.command))

    expect(sessionCommands).toContain(codexBinCommand(repoRoot, 'wp-sessionstart-routing'))
    expect(preToolCommands).toContain(codexBinCommand(repoRoot, 'wp-pretool-guard'))
    expect(postToolCommands).toContain(codexBinCommand(repoRoot, 'wp-post-tool'))
  })

  it('wires the managed PreCompact lane for Claude and Codex but not unsupported Cursor output', async () => {
    const result = await scaffoldAgentHooks({ repoRoot, options: {}, trustCodexHooks: false })

    const claude = JSON.parse(readFileSync(join(repoRoot, '.claude', 'settings.json'), 'utf8')) as {
      hooks: { PreCompact?: Array<{ hooks: Array<{ command: string }> }> }
    }
    const codex = JSON.parse(readFileSync(join(repoRoot, '.codex', 'hooks.json'), 'utf8')) as {
      hooks: { PreCompact?: Array<{ hooks: Array<{ command: string }> }> }
    }
    const cursor = buildCursorHooksConfig({
      resolveBin: (name) => `./node_modules/.bin/${name}`,
      matchers: { preToolUse: 'Bash|Write|Edit', postToolUse: 'Write|Edit' },
    }) as Record<string, unknown>

    const claudePreCompactCommands = (claude.hooks.PreCompact ?? []).flatMap((group) =>
      group.hooks.map((hook) => hook.command),
    )
    const codexPreCompactCommands = (codex.hooks.PreCompact ?? []).flatMap((group) =>
      group.hooks.map((hook) => hook.command),
    )

    expect(claudePreCompactCommands).toStrictEqual([claudeBinCommand('wp-precompact-snapshot')])
    expect(codexPreCompactCommands).toStrictEqual([
      codexBinCommand(repoRoot, 'wp-precompact-snapshot'),
    ])
    expect(result.manifest.claude.PreCompact?.[0]?.hooks[0]?.command).toBe(
      claudeBinCommand('wp-precompact-snapshot'),
    )
    expect(result.manifest.codex.PreCompact?.[0]?.hooks[0]?.command).toBe(
      codexBinCommand(repoRoot, 'wp-precompact-snapshot'),
    )
    expect(
      readFileSync(
        join(repoRoot, '.claude', 'hooks', 'managed', 'wp-precompact-snapshot.sh'),
        'utf8',
      ),
    ).toContain('bin/wp-precompact-snapshot.js')
    expect(
      readFileSync(join(repoRoot, '.codex', 'managed-hooks', 'wp-precompact-snapshot.sh'), 'utf8'),
    ).toContain('bin/wp-precompact-snapshot.js')

    // Cursor has no supported PreCompact/project-hook equivalent today. The
    // Cursor emitter must degrade explicitly by omitting the managed
    // wp-precompact-snapshot lane instead of inventing a lossy hook mapping.
    expect(Object.hasOwn(cursor, 'preCompact')).toBe(false)
    expect(Object.hasOwn(cursor, 'beforeCompact')).toBe(false)
    expect(JSON.stringify(cursor)).not.toContain('wp-precompact-snapshot')
  })

  it('fails closed for missing wp-pretool-guard launcher, emits JSON for missing Stop launcher, and fails open for other missing Codex hook launchers', async () => {
    await scaffoldAgentHooks({ repoRoot, options: {}, trustCodexHooks: false })

    const siblingCwd = mkdtempSync(join(repoRoot, 'codex-missing-bins-'))
    const codex = JSON.parse(readFileSync(join(repoRoot, '.codex', 'hooks.json'), 'utf8')) as {
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>
    }

    const commandByEvent = {
      SessionStart: (codex.hooks.SessionStart ?? []).flatMap((group) =>
        group.hooks.map((hook) => hook.command),
      ),
      PreToolUse: (codex.hooks.PreToolUse ?? []).flatMap((group) =>
        group.hooks.map((hook) => hook.command),
      ),
      PostToolUse: (codex.hooks.PostToolUse ?? []).flatMap((group) =>
        group.hooks.map((hook) => hook.command),
      ),
      UserPromptSubmit: (codex.hooks.UserPromptSubmit ?? []).flatMap((group) =>
        group.hooks.map((hook) => hook.command),
      ),
      Stop: (codex.hooks.Stop ?? []).flatMap((group) => group.hooks.map((hook) => hook.command)),
    }

    for (const bin of WEBPRESSO_HOOK_BINS) {
      chmodSync(join(repoRoot, '.codex', 'managed-hooks', `${bin}.sh`), 0o644)
    }

    const runFromSibling = (command: string) =>
      spawnSync('sh', ['-c', command], {
        cwd: siblingCwd,
        encoding: 'utf8',
        env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
      })

    const preTool = commandByEvent.PreToolUse[0]
    expect(preTool).toContain('wp-pretool-guard')
    const preToolResult = runFromSibling(preTool ?? '')
    expect(preToolResult.status, preTool).toBe(0)
    expect(preToolResult.stdout).toContain('"hookEventName":"PreToolUse"')
    expect(preToolResult.stdout).toContain('"permissionDecision":"deny"')
    expect(preToolResult.stdout).toContain('"wp not found on PATH.')

    const stopResults = await Promise.all(
      commandByEvent.Stop.map(async (command) => ({
        command,
        result: await runShellCommand(command, {
          cwd: siblingCwd,
          env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
        }),
      })),
    )
    for (const { command, result } of stopResults) {
      expect(result.status, `Stop: ${command}`).toBe(0)
      expect(result.stdout, `Stop: ${command}`).toBe('{}\n')
      expect(() => JSON.parse(result.stdout)).not.toThrow()
    }

    const failOpenEvents: Array<keyof typeof commandByEvent> = [
      'SessionStart',
      'PostToolUse',
      'UserPromptSubmit',
    ]
    const failOpenResults = await Promise.all(
      failOpenEvents.flatMap((event) =>
        commandByEvent[event].map(async (command) => ({
          event,
          command,
          result: await runShellCommand(command, {
            cwd: siblingCwd,
            env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
          }),
        })),
      ),
    )
    for (const { event, command, result } of failOpenResults) {
      expect(result.status, `${event}: ${command}`).toBe(0)
      expect(result.stdout, `${event}: ${command}`).toBe('')
    }
  })

  it('preserves a real wp-pretool-guard failure instead of masking it as a missing launcher', async () => {
    await scaffoldAgentHooks({ repoRoot, options: {}, trustCodexHooks: false })

    const siblingCwd = mkdtempSync(join(repoRoot, 'codex-failing-pretool-'))
    const pretoolLauncher = join(repoRoot, '.codex', 'managed-hooks', 'wp-pretool-guard.sh')
    writeFileSync(
      pretoolLauncher,
      '#!/bin/sh\nprintf "actual guard failure\\n" >&2\nexit 2\n',
      'utf8',
    )
    chmodSync(pretoolLauncher, 0o755)

    const codex = JSON.parse(readFileSync(join(repoRoot, '.codex', 'hooks.json'), 'utf8')) as {
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>
    }
    const preTool = (codex.hooks.PreToolUse ?? []).flatMap((group) =>
      group.hooks.map((hook) => hook.command),
    )[0]

    const result = spawnSync('sh', ['-c', preTool ?? ''], {
      cwd: siblingCwd,
      encoding: 'utf8',
      env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
    })

    expect(result.status).toBe(2)
    expect(result.stdout).not.toContain('wp not found on PATH')
    expect(result.stderr).toContain('actual guard failure')
  })

  it('managed Codex Stop launcher emits JSON passthrough when the runtime is unavailable', async () => {
    await scaffoldAgentHooks({ repoRoot, options: {}, trustCodexHooks: false })

    const launcherPath = join(repoRoot, '.codex', 'managed-hooks', 'wp-stop-qa.sh')
    writeFileSync(
      launcherPath,
      readFileSync(launcherPath, 'utf8').replace(
        resolveNodeBinaryForManagedHookLaunchers(),
        '/missing/nonexistent-node',
      ),
      'utf8',
    )
    const result = spawnSync('sh', [launcherPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
    })

    expect(result.status).toBe(0)
    expect(result.stderr).toContain('webpresso hook wp-stop-qa skipped: global wp not found')
    expect(result.stdout).toBe('{}\n')
    expect(() => JSON.parse(result.stdout)).not.toThrow()
  })

  it('managed hook wrappers degrade when the native runtime is absent instead of using the built JS lane', async () => {
    const packageRoot = mkdtempSync(join(repoRoot, 'runtime-absent-package-'))
    mkdirSync(join(packageRoot, 'bin'), { recursive: true })
    mkdirSync(join(packageRoot, 'dist', 'esm', 'cli'), { recursive: true })
    for (const fileName of [
      '_run.js',
      'runtime-lanes.js',
      '_managed-hook.js',
      'wp-pretool-guard.js',
      'wp-stop-qa.js',
    ]) {
      writeFileSync(
        join(packageRoot, 'bin', fileName),
        readFileSync(join(resolvePackageRootForHookLaunchers(), 'bin', fileName), 'utf8'),
        'utf8',
      )
    }
    writeFileSync(
      join(packageRoot, 'package.json'),
      JSON.stringify({ name: '@webpresso/agent-kit', type: 'module' }),
      'utf8',
    )
    writeFileSync(join(packageRoot, '.node-version'), '0.0.0', 'utf8')
    writeFileSync(
      join(packageRoot, 'dist', 'esm', 'cli', 'cli.js'),
      'throw new Error("built lane should not execute")\n',
      'utf8',
    )

    const stop = spawnSync(process.execPath, [join(packageRoot, 'bin', 'wp-stop-qa.js')], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
    })
    const preTool = spawnSync(process.execPath, [join(packageRoot, 'bin', 'wp-pretool-guard.js')], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { ...process.env, PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
    })

    expect(stop.status, stop.stderr).toBe(0)
    expect(stop.stdout).toBe('{}\n')
    expect(stop.stderr).toContain('native hook runtime unavailable')
    expect(stop.stderr).not.toContain('current Node is')
    expect(stop.stderr).not.toContain('built lane should not execute')

    expect(preTool.status, preTool.stderr).toBe(0)
    expect(JSON.parse(preTool.stdout)).toEqual({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason:
          'wp native hook runtime is unavailable. Reinstall @webpresso/agent-kit without omitting optional dependencies and re-run wp setup.',
      },
    })
    expect(preTool.stderr).not.toContain('current Node is')
    expect(preTool.stderr).not.toContain('built lane should not execute')
  })

  it('managed hook wrappers persist unexpected child failures and preserve exit 2 semantics', async () => {
    const packageRoot = mkdtempSync(join(repoRoot, 'managed-hook-child-failure-'))
    const targetId = `${process.platform}-${process.arch}`
    mkdirSync(join(packageRoot, 'bin', 'runtime', targetId), { recursive: true })

    for (const fileName of [
      '_run.js',
      'runtime-lanes.js',
      '_managed-hook.js',
      'wp-pretool-guard.js',
      'wp-stop-qa.js',
      'wp-precompact-snapshot.js',
      'wp-sessionstart-routing.js',
      'wp-post-tool.js',
      'wp-guard-switch.js',
    ]) {
      writeFileSync(
        join(packageRoot, 'bin', fileName),
        readFileSync(join(resolvePackageRootForHookLaunchers(), 'bin', fileName), 'utf8'),
        'utf8',
      )
    }
    writeFileSync(
      join(packageRoot, 'package.json'),
      JSON.stringify({
        name: '@webpresso/agent-kit',
        type: 'module',
        optionalDependencies: { '@webpresso/agent-kit-runtime-test': '0.0.0' },
      }),
      'utf8',
    )
    writeFileSync(
      join(packageRoot, 'bin', 'runtime-manifest.json'),
      JSON.stringify({
        binaryName: 'wp',
        targets: [
          {
            id: targetId,
            os: process.platform,
            cpu: process.arch,
            packageName: '@webpresso/agent-kit-runtime-test',
          },
        ],
      }),
      'utf8',
    )

    const fakeRuntime = join(packageRoot, 'bin', 'runtime', targetId, 'wp')
    writeFileSync(
      fakeRuntime,
      `#!/bin/sh
if [ "\${WP_FAKE_HOOK_MODE:-}" = "signal" ]; then
  kill -TERM $$
fi
printf 'child stdout should not leak\\n'
printf 'child stderr should not leak\\n' >&2
exit "\${WP_FAKE_HOOK_STATUS:-1}"
`,
      'utf8',
    )
    chmodSync(fakeRuntime, 0o755)

    const errorsPath = join(packageRoot, 'hook-errors.json')
    const runManagedBin = (binName: string, status = '1', mode = '') =>
      spawnSync(process.execPath, [join(packageRoot, 'bin', `${binName}.js`)], {
        cwd: repoRoot,
        encoding: 'utf8',
        timeout: 10_000,
        env: {
          ...process.env,
          WP_HOOK_ERRORS_PATH: errorsPath,
          WP_FAKE_HOOK_STATUS: status,
          WP_FAKE_HOOK_MODE: mode,
        },
      })

    const assertNoChildLeak = (result: ReturnType<typeof runManagedBin>) => {
      expect(result.stdout).not.toContain('child stdout should not leak')
      expect(result.stderr).not.toContain('child stderr should not leak')
    }

    for (const binName of ['wp-stop-qa', 'wp-precompact-snapshot']) {
      const result = runManagedBin(binName)
      expect(result.error).toBeUndefined()
      expect(result.status, result.stderr).toBe(0)
      expect(result.stdout).toBe('{}\n')
      expect(result.stderr).toContain('fallback=emit-empty-json')
      assertNoChildLeak(result)
    }

    for (const binName of ['wp-sessionstart-routing', 'wp-post-tool', 'wp-guard-switch']) {
      const result = runManagedBin(binName)
      expect(result.error).toBeUndefined()
      expect(result.status, result.stderr).toBe(0)
      expect(result.stdout).toBe('')
      expect(result.stderr).toContain('fallback=fail-open')
      assertNoChildLeak(result)
    }

    const preTool = runManagedBin('wp-pretool-guard')
    expect(preTool.error).toBeUndefined()
    expect(preTool.status, preTool.stderr).toBe(0)
    expect(JSON.parse(preTool.stdout)).toMatchObject({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
      },
    })
    expect(preTool.stderr).toContain('fallback=fail-closed-deny')
    assertNoChildLeak(preTool)

    const signaled = runManagedBin('wp-post-tool', '1', 'signal')
    expect(signaled.error).toBeUndefined()
    expect(signaled.status, signaled.stderr).toBe(0)
    expect(signaled.stdout).toBe('')
    expect(signaled.stderr).toContain('signal=SIGTERM')
    expect(signaled.stderr).toContain('fallback=fail-open')

    const preservedExitTwo = runManagedBin('wp-pretool-guard', '2')
    expect(preservedExitTwo.error).toBeUndefined()
    expect(preservedExitTwo.status).toBe(2)
    expect(preservedExitTwo.stdout).toContain('child stdout should not leak')
    expect(preservedExitTwo.stderr).toContain('child stderr should not leak')

    const stored = JSON.parse(readFileSync(errorsPath, 'utf8')) as {
      entries: Array<{
        binName: string
        status?: number
        signal?: string
        fallback: string
        detail?: string
      }>
    }
    expect(stored.entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          binName: 'wp-stop-qa',
          status: 1,
          fallback: 'emit-empty-json',
        }),
        expect.objectContaining({
          binName: 'wp-precompact-snapshot',
          status: 1,
          fallback: 'emit-empty-json',
        }),
        expect.objectContaining({
          binName: 'wp-sessionstart-routing',
          status: 1,
          fallback: 'fail-open',
        }),
        expect.objectContaining({
          binName: 'wp-post-tool',
          status: 1,
          fallback: 'fail-open',
        }),
        expect.objectContaining({
          binName: 'wp-guard-switch',
          status: 1,
          fallback: 'fail-open',
        }),
        expect.objectContaining({
          binName: 'wp-pretool-guard',
          status: 1,
          fallback: 'fail-closed-deny',
        }),
        expect.objectContaining({
          binName: 'wp-post-tool',
          signal: 'SIGTERM',
          fallback: 'fail-open',
        }),
      ]),
    )
    expect(stored.entries).toHaveLength(7)
    expect(JSON.stringify(stored)).not.toContain('child stdout should not leak')
    expect(JSON.stringify(stored)).not.toContain('child stderr should not leak')
  }, 30_000)

  it('managed Codex launchers preserve event-specific fallbacks when repo root cannot be entered', async () => {
    await scaffoldAgentHooks({ repoRoot, options: {}, trustCodexHooks: false })

    const missingRepoRoot = join(repoRoot, 'missing-repo-root')
    const preToolLauncherPath = join(repoRoot, '.codex', 'managed-hooks', 'wp-pretool-guard.sh')
    const stopLauncherPath = join(repoRoot, '.codex', 'managed-hooks', 'wp-stop-qa.sh')
    for (const launcherPath of [preToolLauncherPath, stopLauncherPath]) {
      writeFileSync(
        launcherPath,
        readFileSync(launcherPath, 'utf8').replace(
          quoteShell(repoRoot),
          quoteShell(missingRepoRoot),
        ),
        'utf8',
      )
    }

    const preTool = spawnSync('sh', [preToolLauncherPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
    })
    const stop = spawnSync('sh', [stopLauncherPath], {
      cwd: repoRoot,
      encoding: 'utf8',
      env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
    })

    expect(preTool.status).toBe(0)
    expect(JSON.parse(preTool.stdout)).toMatchObject({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
      },
    })
    expect(stop.status).toBe(0)
    expect(stop.stdout).toBe('{}\n')
  })

  it('keeps Codex hook commands executable from a sibling cwd instead of failing with 127', async () => {
    initGitRepo(repoRoot)
    await scaffoldAgentHooks({ repoRoot, options: {}, trustCodexHooks: false })

    const binPath = join(
      repoRoot,
      'node_modules',
      '@webpresso',
      'agent-kit',
      'bin',
      'wp-pretool-guard.js',
    )
    mkdirSync(join(repoRoot, 'node_modules', '@webpresso', 'agent-kit', 'bin'), { recursive: true })
    writeFileSync(binPath, '#!/usr/bin/env node\nprocess.stdout.write("{}\\n")\n', 'utf8')
    chmodSync(binPath, 0o755)

    const siblingCwd = mkdtempSync(join(repoRoot, 'sibling-'))
    const codex = JSON.parse(readFileSync(join(repoRoot, '.codex', 'hooks.json'), 'utf8')) as {
      hooks: { PreToolUse: Array<{ hooks: Array<{ command: string }> }> }
    }
    const command = codex.hooks.PreToolUse[0]?.hooks[0]?.command

    const result = spawnSync('sh', ['-lc', command ?? ''], {
      cwd: siblingCwd,
      encoding: 'utf8',
      input: '{}',
    })

    expect(command).toBe(codexBinCommand(repoRoot, 'wp-pretool-guard'))
    expect(result.status).toBe(0)
  })

  it('keeps the Codex Stop hook executable from a sibling cwd instead of failing with 127', async () => {
    initGitRepo(repoRoot)
    await scaffoldAgentHooks({ repoRoot, options: {}, trustCodexHooks: false })

    const binPath = join(
      repoRoot,
      'node_modules',
      '@webpresso',
      'agent-kit',
      'bin',
      'wp-stop-qa.js',
    )
    mkdirSync(join(repoRoot, 'node_modules', '@webpresso', 'agent-kit', 'bin'), { recursive: true })
    writeFileSync(binPath, '#!/usr/bin/env node\nprocess.exit(0)\n', 'utf8')
    chmodSync(binPath, 0o755)

    const siblingCwd = mkdtempSync(join(repoRoot, 'sibling-stop-'))
    const codex = JSON.parse(readFileSync(join(repoRoot, '.codex', 'hooks.json'), 'utf8')) as {
      hooks: { Stop: Array<{ hooks: Array<{ command: string }> }> }
    }
    const command = codex.hooks.Stop[0]?.hooks[0]?.command

    const result = spawnSync('sh', ['-c', command ?? ''], {
      cwd: siblingCwd,
      encoding: 'utf8',
    })

    expect(command).toBe(codexBinCommand(repoRoot, 'wp-stop-qa'))
    expect(result.status).toBe(0)
  })

  it('executes every generated Claude hook command successfully from outside repo root', async () => {
    initGitRepo(repoRoot)
    process.env.WP_HOOK_NODE_PATH = installFakeNodeRuntime(repoRoot)
    await scaffoldAgentHooks({ repoRoot, options: {}, trustCodexHooks: false })
    const fixtureBinDir = installFakeWebpressoBins(repoRoot)

    const siblingCwd = mkdtempSync(join(repoRoot, 'claude-smoke-'))
    const settings = JSON.parse(
      readFileSync(join(repoRoot, '.claude', 'settings.json'), 'utf8'),
    ) as {
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>
    }

    const commands = Array.from(
      new Set(
        [
          'SessionStart',
          'PreToolUse',
          'PostToolUse',
          'UserPromptSubmit',
          'Stop',
          'PreCompact',
        ].flatMap((event) =>
          (settings.hooks[event] ?? []).flatMap((group) => group.hooks.map((hook) => hook.command)),
        ),
      ),
    )

    expect(commands.length).toBeGreaterThan(0)
    const runtimeLog = join(repoRoot, 'claude-hook-runtime.log')
    const binLog = join(repoRoot, 'claude-hook-bins.log')
    const results = await runHookCommands(commands, {
      cwd: siblingCwd,
      env: {
        PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
        HOME: repoRoot,
        CLAUDE_PROJECT_DIR: repoRoot,
        WP_HOOK_SMOKE_BIN_DIR: fixtureBinDir,
        WP_HOOK_SMOKE_BIN_LOG: binLog,
        WP_HOOK_SMOKE_RUNTIME_LOG: runtimeLog,
        WP_SKIP_UPDATE_CHECK: '1',
      },
    })

    for (const result of results) {
      expect(result.status, `${result.command}\n${result.stderr}`).toBe(0)
      expect(result.stderr, result.command).toBe('')
      for (const line of result.stdout.trim().split('\n').filter(Boolean)) {
        expect(() => JSON.parse(line), `${result.command}\n${line}`).not.toThrow()
      }
    }
    assertSmokeRanEveryWebpressoBin(runtimeLog, binLog)
  }, 30_000)

  it('executes every generated Codex hook command successfully from a sibling cwd', async () => {
    initGitRepo(repoRoot)
    process.env.WP_HOOK_NODE_PATH = installFakeNodeRuntime(repoRoot)
    await scaffoldAgentHooks({ repoRoot, options: {}, trustCodexHooks: false })
    const fixtureBinDir = installFakeWebpressoBins(repoRoot)

    const siblingCwd = mkdtempSync(join(repoRoot, 'codex-smoke-'))
    const codex = JSON.parse(readFileSync(join(repoRoot, '.codex', 'hooks.json'), 'utf8')) as {
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>
    }

    const commands = Array.from(
      new Set(
        [
          'SessionStart',
          'PreToolUse',
          'PostToolUse',
          'UserPromptSubmit',
          'Stop',
          'PreCompact',
        ].flatMap((event) =>
          (codex.hooks[event] ?? []).flatMap((group) => group.hooks.map((hook) => hook.command)),
        ),
      ),
    )

    expect(commands.length).toBeGreaterThan(0)
    const runtimeLog = join(repoRoot, 'codex-hook-runtime.log')
    const binLog = join(repoRoot, 'codex-hook-bins.log')
    const results = await runHookCommands(commands, {
      cwd: siblingCwd,
      env: {
        PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
        HOME: repoRoot,
        WP_HOOK_SMOKE_BIN_DIR: fixtureBinDir,
        WP_HOOK_SMOKE_BIN_LOG: binLog,
        WP_HOOK_SMOKE_RUNTIME_LOG: runtimeLog,
        WP_SKIP_UPDATE_CHECK: '1',
      },
    })

    for (const result of results) {
      expect(result.status, `${result.command}\n${result.stderr}`).toBe(0)
      expect(result.stderr, result.command).toBe('')
      for (const line of result.stdout.trim().split('\n').filter(Boolean)) {
        expect(() => JSON.parse(line), `${result.command}\n${line}`).not.toThrow()
      }
    }
    assertSmokeRanEveryWebpressoBin(runtimeLog, binLog)
  }, 30_000)
})

describe('classifyWebpressoHookBin', () => {
  it('classifies canonical, legacy, null, and unrelated bin names exactly', () => {
    expect(classifyWebpressoHookBin('wp-pretool-guard')).toStrictEqual({
      kind: 'canonical',
      binName: 'wp-pretool-guard',
    })
    expect(classifyWebpressoHookBin('ak-pretool-guard')).toStrictEqual({
      kind: 'legacy',
      binName: 'ak-pretool-guard',
    })
    expect(classifyWebpressoHookBin(null)).toBeNull()
    expect(classifyWebpressoHookBin('not-webpresso')).toBeNull()
  })
})

describe('hoistTopLevelEvents', () => {
  it('moves top-level event keys into the wrapped `hooks` key', async () => {
    const input = {
      SessionStart: [
        { hooks: [{ type: 'command', command: './node_modules/.bin/wp-sessionstart-routing' }] },
      ],
      PreToolUse: [
        {
          matcher: 'Bash',
          hooks: [{ type: 'command', command: './node_modules/.bin/wp-pretool-guard' }],
        },
      ],
    }

    const result = hoistTopLevelEvents(input)

    expect(result).not.toHaveProperty('SessionStart')
    expect(result).not.toHaveProperty('PreToolUse')
    expect(result).toHaveProperty('hooks')
    const hooks = result.hooks as Record<string, Array<{ hooks: Array<{ command: string }> }>>
    expect(hooks.SessionStart?.[0]?.hooks[0]?.command).toContain('wp-sessionstart-routing')
    expect(hooks.PreToolUse?.[0]?.hooks[0]?.command).toContain('wp-pretool-guard')
  })

  it('leaves already-wrapped input unchanged in shape (idempotent)', async () => {
    const input = {
      hooks: {
        SessionStart: [{ hooks: [{ type: 'command', command: 'node /opt/omx/hook.js' }] }],
      },
    }

    const result = hoistTopLevelEvents(input)

    expect(result).toStrictEqual(input)
  })

  it('dedupes when both top-level and wrapped contain the same wp-* command', async () => {
    const input = {
      SessionStart: [
        { hooks: [{ type: 'command', command: './node_modules/.bin/wp-sessionstart-routing' }] },
      ],
      hooks: {
        SessionStart: [
          { hooks: [{ type: 'command', command: './node_modules/.bin/wp-sessionstart-routing' }] },
        ],
      },
    }

    const result = hoistTopLevelEvents(input)

    const hooks = result.hooks as Record<string, Array<{ hooks: Array<{ command: string }> }>>
    const akCount = (hooks.SessionStart ?? [])
      .flatMap((g) => g.hooks.map((h) => h.command))
      .filter((c) => c.includes('wp-sessionstart-routing')).length
    expect(akCount).toBe(1)
  })

  it('passes through non-event top-level keys untouched', async () => {
    const input = {
      $schema: 'https://example.com/schema.json',
      SessionStart: [
        { hooks: [{ type: 'command', command: './node_modules/.bin/wp-sessionstart-routing' }] },
      ],
    }

    const result = hoistTopLevelEvents(input)

    expect(result.$schema).toBe('https://example.com/schema.json')
    expect(result).not.toHaveProperty('SessionStart')
  })
})

describe('plugin-native invariants — .claude/settings.json', () => {
  let repoRoot: string

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'wp-agent-hooks-invariant-'))
  })

  afterEach(async () => {
    await import('node:fs/promises').then((fs) => fs.rm(repoRoot, { recursive: true, force: true }))
  })

  it('generated settings.json contains no legacy external hook commands', async () => {
    await scaffoldAgentHooks({ repoRoot, options: {} })

    const settings = JSON.parse(
      readFileSync(join(repoRoot, '.claude', 'settings.json'), 'utf8'),
    ) as { hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>> }

    const allCommands = Object.values(settings.hooks).flatMap((groups) =>
      groups.flatMap((group) => group.hooks.map((hook) => hook.command)),
    )

    for (const command of allCommands) {
      expect(command).not.toContain('pretooluse.mjs')
      expect(command).not.toContain('.claude/plugins/cache')
    }
  })

  it('generated settings.json PreToolUse matchers cover context-heavy Read, Grep, WebFetch, Agent, and MCP tools', async () => {
    await scaffoldAgentHooks({ repoRoot, options: {} })

    const settings = JSON.parse(
      readFileSync(join(repoRoot, '.claude', 'settings.json'), 'utf8'),
    ) as { hooks: { PreToolUse: Array<{ matcher?: string }> } }

    const matchers = settings.hooks.PreToolUse.flatMap((group) =>
      group.matcher ? group.matcher.split('|') : [],
    )

    for (const term of [
      'Bash',
      'Read',
      'Grep',
      'WebFetch',
      'Agent',
      'Write',
      'Edit',
      'MultiEdit',
      'mcp__.*',
    ]) {
      expect(matchers).toContain(term)
    }
  })
})

describe('buildWebpressoHookGroups', () => {
  it('returns the canonical 6 wp-* event groups with the supplied bin resolver', async () => {
    const result = buildWebpressoHookGroups({
      resolveBin: (name) => `./node_modules/.bin/${name}`,
      matchers: { preToolUse: 'Bash|Edit|Write', postToolUse: 'Edit|Write' },
    })

    expect(Object.keys(result).sort()).toStrictEqual(
      [
        'PostToolUse',
        'PreCompact',
        'PreToolUse',
        'SessionStart',
        'Stop',
        'UserPromptSubmit',
      ].sort(),
    )
    expect(result.SessionStart?.[0]?.hooks[0]?.command).toBe(
      './node_modules/.bin/wp-sessionstart-routing',
    )
    expect(result.PreToolUse?.[0]?.matcher).toBe('Bash|Edit|Write')
    expect(result.PreToolUse?.[0]?.hooks[0]?.command).toBe('./node_modules/.bin/wp-pretool-guard')
    expect(result.PostToolUse?.[0]?.matcher).toBe('Edit|Write')
    expect(result.PostToolUse?.[0]?.hooks[0]?.command).toBe('./node_modules/.bin/wp-post-tool')
    expect(result.UserPromptSubmit?.[0]?.hooks[0]?.command).toBe(
      './node_modules/.bin/wp-guard-switch',
    )
    expect(result.Stop?.[0]?.hooks[0]?.command).toBe('./node_modules/.bin/wp-stop-qa')
    expect(result.PreCompact?.[0]?.hooks[0]?.command).toBe(
      './node_modules/.bin/wp-precompact-snapshot',
    )
    expect(result.PreCompact?.[0]?.matcher).toBe(undefined)
  })

  it('substitutes the Claude bin resolver for guarded $CLAUDE_PROJECT_DIR commands', async () => {
    const result = buildWebpressoHookGroups({
      resolveBin: (name) =>
        `[ -x "$CLAUDE_PROJECT_DIR/node_modules/.bin/${name}" ] && "$CLAUDE_PROJECT_DIR/node_modules/.bin/${name}" || true`,
      matchers: { preToolUse: 'Bash|Write|Edit|MultiEdit', postToolUse: 'Write|Edit|MultiEdit' },
    })

    expect(result.SessionStart?.[0]?.hooks[0]?.command).toContain('$CLAUDE_PROJECT_DIR')
    expect(result.SessionStart?.[0]?.hooks[0]?.command).toContain('wp-sessionstart-routing')
    expect(result.PreToolUse?.[0]?.matcher).toBe('Bash|Write|Edit|MultiEdit')
  })
})

describe('BP1 hotfix: launcher chain, node fallback, gstack stdin scoping, stop-qa timeout', () => {
  let repoRoot: string

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'wp-agent-hooks-bp1-'))
  })

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true })
  })

  it('materializes skill wp-commands with a visible skip warning when global wp is missing', async () => {
    const skillDir = join(repoRoot, '.agent', 'skills', 'verify')
    mkdirSync(skillDir, { recursive: true })
    writeFileSync(
      join(skillDir, 'SKILL.md'),
      [
        '---',
        'hooks:',
        '  Stop:',
        '    - command: wp audit agents',
        '      timeout: 20',
        '---',
        '',
        '# verify',
        '',
      ].join('\n'),
      'utf8',
    )

    await scaffoldAgentHooks({ repoRoot, options: {}, trustCodexHooks: false })

    const settings = JSON.parse(
      readFileSync(join(repoRoot, '.claude', 'settings.json'), 'utf8'),
    ) as {
      hooks: { Stop: Array<{ hooks: Array<{ command: string }> }> }
    }
    const stopCommand = settings.hooks.Stop.flatMap((group) =>
      group.hooks.map((hook) => hook.command),
    ).find((command) => command.includes('# from-skill: verify'))
    expect(stopCommand).toContain('# from-skill: verify')
    expect(stopCommand).toContain('if command -v wp >/dev/null 2>&1; then')
    expect(stopCommand).toContain('wp audit agents >/dev/null')
    // Skipped runs warn on stderr instead of silently succeeding.
    expect(stopCommand).toContain('>&2')
    expect(stopCommand).not.toContain('|| true')
  })

  it('renders shim launchers with direct-bin execution and no duplicated exit 0', async () => {
    await scaffoldAgentHooks({ repoRoot, options: {}, trustCodexHooks: false })
    for (const bin of WEBPRESSO_HOOK_BINS) {
      const launcher = readFileSync(
        join(repoRoot, '.claude', 'hooks', 'managed', `${bin}.sh`),
        'utf8',
      )
      expect(launcher).toContain(`bin/${bin}.js`)
      expect(launcher).not.toMatch(/exit 0\s+exit 0/u)
    }
    // Non-guard hooks warn on stderr (never silently skip); guard stays fail-closed.
    const sessionStart = readFileSync(
      join(repoRoot, '.claude', 'hooks', 'managed', 'wp-sessionstart-routing.sh'),
      'utf8',
    )
    expect(sessionStart).toContain('>&2')
    const guard = readFileSync(
      join(repoRoot, '.claude', 'hooks', 'managed', 'wp-pretool-guard.sh'),
      'utf8',
    )
    expect(guard).toContain('permissionDecision')
  })

  it('scopes the gstack PreToolUse check to gstack-owned skills via stdin', async () => {
    await scaffoldAgentHooks({
      repoRoot,
      options: {},
      gstackEnabled: true,
      trustCodexHooks: false,
    })
    const checkGstackPath = join(repoRoot, '.claude', 'hooks', 'check-gstack.sh')
    const checkGstack = readFileSync(checkGstackPath, 'utf8')
    expect(checkGstack).toContain('"skill"')
    expect(checkGstack).toContain('case "$skill" in')

    // HOME without gstack so the missing-gstack branch is exercised.
    const nonGstack = spawnSync('sh', [checkGstackPath], {
      input: JSON.stringify({ tool_name: 'Skill', tool_input: { skill: 'webpresso:qa' } }),
      encoding: 'utf8',
      env: { ...process.env, HOME: repoRoot },
    })
    expect(nonGstack.stdout).not.toContain('permissionDecision')

    const gstackOwned = spawnSync('sh', [checkGstackPath], {
      input: JSON.stringify({ tool_name: 'Skill', tool_input: { skill: 'browse' } }),
      encoding: 'utf8',
      env: { ...process.env, HOME: repoRoot },
    })
    expect(gstackOwned.stdout).toContain('"permissionDecision":"deny"')
  })

  it('regenerates the gstack check scripts when the template changes', async () => {
    const hooksDir = join(repoRoot, '.claude', 'hooks')
    mkdirSync(hooksDir, { recursive: true })
    writeFileSync(join(hooksDir, 'check-gstack.sh'), '#!/bin/sh\nexit 1\n', 'utf8')

    await scaffoldAgentHooks({
      repoRoot,
      options: {},
      gstackEnabled: true,
      trustCodexHooks: false,
    })

    const content = readFileSync(join(hooksDir, 'check-gstack.sh'), 'utf8')
    expect(content).toContain('case "$skill" in')
  })

  it('emits a measured timeout for the wp-stop-qa Stop hook', () => {
    const groups = buildWebpressoHookGroups({
      resolveBin: (name) => name,
      matchers: { preToolUse: 'Bash', postToolUse: 'Write' },
    })
    const stopEntry = groups.Stop?.flatMap((group) => group.hooks).find((hook) =>
      hook.command.includes('wp-stop-qa'),
    )
    expect(stopEntry?.timeout).toBeGreaterThan(0)
    expect(stopEntry?.timeout).toBeLessThan(60)
  })
})
