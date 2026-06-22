import {
  chmodSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs'
import { spawnSync } from 'node:child_process'
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
  scaffoldAgentHooks,
  trustCodexWebpressoHooksForRepo,
} from './index.js'

function quoteShell(value: string): string {
  return `'${value.replaceAll("'", "'\\''")}'`
}

function directWpHookCommand(repoRoot: string, name: string): string {
  const wpPath = quoteShell(join(process.cwd(), 'bin', 'wp'))
  const nodePath = quoteShell(process.execPath)
  const repoRootPath = quoteShell(repoRoot)
  const hookName = name.startsWith('wp-') ? name.slice(3) : name
  const fallback =
    name === 'wp-stop-qa' || name === 'wp-precompact-snapshot'
      ? `printf '%s\\n' '{}'`
      : name === 'wp-pretool-guard'
        ? `printf '%s\\n' '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"wp not found on PATH. Install with npm install -g @webpresso/agent-kit and re-run wp setup."}}'`
        : 'true'
  return `if [ -x ${nodePath} ] && [ -f ${wpPath} ]; then (cd ${repoRootPath} && ${nodePath} ${wpPath} hook ${hookName}); status=$?; if [ "$status" -eq 2 ]; then exit 2; elif [ "$status" -ne 0 ]; then ${fallback}; fi; else ${fallback}; fi # ${name}`
}

function codexBinCommand(repoRoot: string, name: string): string {
  return directWpHookCommand(repoRoot, name)
}

function claudeBinCommand(repoRoot: string, name: string): string {
  return directWpHookCommand(repoRoot, name)
}

function initGitRepo(root: string): void {
  const result = spawnSync('git', ['init'], {
    cwd: root,
    encoding: 'utf8',
    stdio: 'pipe',
  })
  expect(result.status, result.stderr).toBe(0)
}

describe('hookSubcommandFor (direct hook dispatch gate)', () => {
  it('returns the wp hook subcommand for dispatchable hooks', () => {
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

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'wp-agent-hooks-'))
    previousCodexHome = process.env.CODEX_HOME
    previousHome = process.env.HOME
    process.env.HOME = join(repoRoot, '.home')
    process.env.CODEX_HOME = join(repoRoot, '.codex-home')
  })

  afterEach(async () => {
    if (previousCodexHome === undefined) delete process.env.CODEX_HOME
    else process.env.CODEX_HOME = previousCodexHome
    if (previousHome === undefined) delete process.env.HOME
    else process.env.HOME = previousHome
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
    expect(claudeCommands).toContain(claudeBinCommand(repoRoot, 'wp-sessionstart-routing'))
    expect(codexCommands).toContain(codexBinCommand(repoRoot, 'wp-sessionstart-routing'))
    expect(
      existsSync(join(repoRoot, '.claude', 'hooks', 'managed', 'wp-sessionstart-routing.sh')),
    ).toBe(false)
    expect(
      existsSync(join(repoRoot, '.codex', 'managed-hooks', 'wp-sessionstart-routing.sh')),
    ).toBe(false)
  })

  it('does not materialize hook launcher scripts on repeated setup', async () => {
    await scaffoldAgentHooks({ repoRoot, options: {}, trustCodexHooks: false })
    await scaffoldAgentHooks({ repoRoot, options: {}, trustCodexHooks: false })

    expect(
      existsSync(join(repoRoot, '.codex', 'managed-hooks', 'wp-sessionstart-routing.sh')),
    ).toBe(false)
    expect(
      existsSync(join(repoRoot, '.claude', 'hooks', 'managed', 'wp-sessionstart-routing.sh')),
    ).toBe(false)
  })

  it('uses the absolute package wp hook path instead of node_modules hook shims', async () => {
    mkdirSync(join(repoRoot, 'node_modules', '.bin'), { recursive: true })
    const shimPath = join(repoRoot, 'node_modules', '.bin', 'wp-guard-switch')
    writeFileSync(shimPath, '#!/bin/sh\nexit 42\n', 'utf8')
    chmodSync(shimPath, 0o755)

    await scaffoldAgentHooks({ repoRoot, options: {}, trustCodexHooks: false })
    const codex = JSON.parse(readFileSync(join(repoRoot, '.codex', 'hooks.json'), 'utf8')) as {
      hooks: { UserPromptSubmit: Array<{ hooks: Array<{ command: string }> }> }
    }
    const command = codex.hooks.UserPromptSubmit[0]?.hooks[0]?.command ?? ''
    expect(command).toContain('bin/wp')
    expect(command).toContain(' hook guard-switch')
    expect(command).not.toContain('node_modules/.bin')
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
                command: codexBinCommand(repoRoot, 'wp-pretool-guard'),
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
                command: codexBinCommand(repoRoot, 'wp-pretool-guard'),
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
                command: codexBinCommand(repoRoot, 'wp-pretool-guard'),
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
                command: codexBinCommand(repoRoot, 'wp-pretool-guard'),
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
      env: {
        ...process.env,
        CLAUDE_PROJECT_DIR: repoRoot,
        PATH: `${binDir}:${process.env.PATH ?? ''}`,
      },
      encoding: 'utf8',
    })

    expect(result.stdout).toBe('')
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
                  command: 'node /pkg/bin/wp hook sessionstart-routing # wp-sessionstart-routing',
                  timeout: 5,
                },
              ],
            },
          ],
          PreToolUse: [
            {
              matcher: 'Bash|Edit|Write',
              hooks: [
                {
                  type: 'command',
                  command: 'node /pkg/bin/wp hook pretool-guard # wp-pretool-guard',
                  timeout: 5,
                },
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

  it('writes Codex hook commands as direct wp hook invocations', async () => {
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
      resolveBin: (name) => `node /pkg/bin/wp hook ${name.slice(3)} # ${name}`,
      matchers: { preToolUse: 'Bash|Write|Edit', postToolUse: 'Write|Edit' },
    }) as Record<string, unknown>

    const claudePreCompactCommands = (claude.hooks.PreCompact ?? []).flatMap((group) =>
      group.hooks.map((hook) => hook.command),
    )
    const codexPreCompactCommands = (codex.hooks.PreCompact ?? []).flatMap((group) =>
      group.hooks.map((hook) => hook.command),
    )

    expect(claudePreCompactCommands).toStrictEqual([
      claudeBinCommand(repoRoot, 'wp-precompact-snapshot'),
    ])
    expect(codexPreCompactCommands).toStrictEqual([
      codexBinCommand(repoRoot, 'wp-precompact-snapshot'),
    ])
    expect(result.manifest.claude.PreCompact?.[0]?.hooks[0]?.command).toBe(
      claudeBinCommand(repoRoot, 'wp-precompact-snapshot'),
    )
    expect(result.manifest.codex.PreCompact?.[0]?.hooks[0]?.command).toBe(
      codexBinCommand(repoRoot, 'wp-precompact-snapshot'),
    )
    expect(
      existsSync(join(repoRoot, '.claude', 'hooks', 'managed', 'wp-precompact-snapshot.sh')),
    ).toBe(false)
    expect(existsSync(join(repoRoot, '.codex', 'managed-hooks', 'wp-precompact-snapshot.sh'))).toBe(
      false,
    )

    // Cursor has no supported PreCompact/project-hook equivalent today. The
    // Cursor emitter must degrade explicitly by omitting the managed
    // wp-precompact-snapshot lane instead of inventing a lossy hook mapping.
    expect(Object.hasOwn(cursor, 'preCompact')).toBe(false)
    expect(Object.hasOwn(cursor, 'beforeCompact')).toBe(false)
    expect(JSON.stringify(cursor)).not.toContain('wp-precompact-snapshot')
  })

  it('keeps Codex hook commands executable from a sibling cwd instead of failing with 127', async () => {
    initGitRepo(repoRoot)
    await scaffoldAgentHooks({ repoRoot, options: {}, trustCodexHooks: false })

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
})

describe('classifyWebpressoHookBin', () => {
  it('classifies canonical, null, and unrelated bin names exactly', () => {
    expect(classifyWebpressoHookBin('wp-pretool-guard')).toStrictEqual({
      kind: 'canonical',
      binName: 'wp-pretool-guard',
    })
    expect(classifyWebpressoHookBin('old-pretool-guard')).toBeNull()
    expect(classifyWebpressoHookBin(null)).toBeNull()
    expect(classifyWebpressoHookBin('not-webpresso')).toBeNull()
  })
})

describe('hoistTopLevelEvents', () => {
  it('moves top-level event keys into the wrapped `hooks` key', async () => {
    const input = {
      SessionStart: [
        {
          hooks: [
            {
              type: 'command',
              command: 'node /pkg/bin/wp hook sessionstart-routing # wp-sessionstart-routing',
            },
          ],
        },
      ],
      PreToolUse: [
        {
          matcher: 'Bash',
          hooks: [
            { type: 'command', command: 'node /pkg/bin/wp hook pretool-guard # wp-pretool-guard' },
          ],
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
        {
          hooks: [
            {
              type: 'command',
              command: 'node /pkg/bin/wp hook sessionstart-routing # wp-sessionstart-routing',
            },
          ],
        },
      ],
      hooks: {
        SessionStart: [
          {
            hooks: [
              {
                type: 'command',
                command: 'node /pkg/bin/wp hook sessionstart-routing # wp-sessionstart-routing',
              },
            ],
          },
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
        {
          hooks: [
            {
              type: 'command',
              command: 'node /pkg/bin/wp hook sessionstart-routing # wp-sessionstart-routing',
            },
          ],
        },
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
      resolveBin: (name) => `node /pkg/bin/wp hook ${name.slice(3)} # ${name}`,
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
      'node /pkg/bin/wp hook sessionstart-routing # wp-sessionstart-routing',
    )
    expect(result.PreToolUse?.[0]?.matcher).toBe('Bash|Edit|Write')
    expect(result.PreToolUse?.[0]?.hooks[0]?.command).toBe(
      'node /pkg/bin/wp hook pretool-guard # wp-pretool-guard',
    )
    expect(result.PostToolUse?.[0]?.matcher).toBe('Edit|Write')
    expect(result.PostToolUse?.[0]?.hooks[0]?.command).toBe(
      'node /pkg/bin/wp hook post-tool # wp-post-tool',
    )
    expect(result.UserPromptSubmit?.[0]?.hooks[0]?.command).toBe(
      'node /pkg/bin/wp hook guard-switch # wp-guard-switch',
    )
    expect(result.Stop?.[0]?.hooks[0]?.command).toBe('node /pkg/bin/wp hook stop-qa # wp-stop-qa')
    expect(result.PreCompact?.[0]?.hooks[0]?.command).toBe(
      'node /pkg/bin/wp hook precompact-snapshot # wp-precompact-snapshot',
    )
    expect(result.PreCompact?.[0]?.matcher).toBe(undefined)
  })

  it('substitutes the Claude bin resolver for guarded $CLAUDE_PROJECT_DIR commands', async () => {
    const result = buildWebpressoHookGroups({
      resolveBin: (name) => `node /pkg/bin/wp hook ${name.slice(3)} # ${name}`,
      matchers: { preToolUse: 'Bash|Write|Edit|MultiEdit', postToolUse: 'Write|Edit|MultiEdit' },
    })

    expect(result.SessionStart?.[0]?.hooks[0]?.command).toContain('wp hook sessionstart-routing')
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
