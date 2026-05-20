import { chmodSync, existsSync, mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  buildAgentKitHookGroups,
  hoistTopLevelEvents,
  scaffoldAgentHooks,
  trustCodexAgentKitHooksForRepo,
  trustCodexPresetHooksForUser,
} from './index.js'

function codexBinCommand(repoRoot: string, name: string): string {
  const binPath = join(repoRoot, 'node_modules', '.bin', name)
  return `[ -x "${binPath}" ] && "${binPath}" || true`
}

const AGENT_KIT_HOOK_BINS = [
  'ak-sessionstart-routing',
  'ak-check-dev-link',
  'ak-pretool-guard',
  'ak-post-tool',
  'ak-guard-switch',
  'ak-stop-qa',
] as const

function installFakeAgentKitBins(repoRoot: string): void {
  mkdirSync(join(repoRoot, 'node_modules', '.bin'), { recursive: true })
  for (const bin of AGENT_KIT_HOOK_BINS) {
    const binPath = join(repoRoot, 'node_modules', '.bin', bin)
    writeFileSync(binPath, '#!/bin/sh\nprintf "{}\\n"\n', 'utf8')
    chmodSync(binPath, 0o755)
  }
}

describe('scaffoldAgentHooks', () => {
  let repoRoot: string
  let previousCodexHome: string | undefined
  let previousHome: string | undefined

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'ak-agent-hooks-'))
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

  it('creates user Claude settings that enable the agent-kit plugin', async () => {
    await scaffoldAgentHooks({ repoRoot, options: {} })

    const settings = JSON.parse(
      readFileSync(join(repoRoot, '.home', '.claude', 'settings.json'), 'utf8'),
    ) as {
      enabledPlugins: Record<string, boolean>
    }

    expect(settings.enabledPlugins['agent-kit@agent-kit']).toBe(true)
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
            'agent-kit@agent-kit': false,
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
    expect(settings.enabledPlugins['agent-kit@agent-kit']).toBe(true)
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
  })

  it('wires ak-check-dev-link as a SessionStart hook in both Claude and Codex', async () => {
    await scaffoldAgentHooks({ repoRoot, options: {} })

    const claude = JSON.parse(readFileSync(join(repoRoot, '.claude', 'settings.json'), 'utf8')) as {
      hooks: { SessionStart: Array<{ hooks: Array<{ command: string }> }> }
    }
    const codex = JSON.parse(readFileSync(join(repoRoot, '.codex', 'hooks.json'), 'utf8')) as {
      hooks: { SessionStart: Array<{ hooks: Array<{ command: string }> }> }
    }

    const claudeCommands = claude.hooks.SessionStart.flatMap((g) => g.hooks.map((h) => h.command))
    const codexCommands = codex.hooks.SessionStart.flatMap((g) => g.hooks.map((h) => h.command))

    expect(claudeCommands.some((cmd) => cmd.includes('ak-check-dev-link'))).toBe(true)
    expect(claudeCommands.some((cmd) => cmd.includes('$CLAUDE_PROJECT_DIR'))).toBe(true)
    expect(codexCommands).toContain(codexBinCommand(repoRoot, 'ak-check-dev-link'))
  })

  it('dedupes pre-existing wrapped script hooks against the raw incoming form', async () => {
    // Regression: hasCommand previously only extracted node_modules/.bin/<name>
    // identifiers. Script paths like .claude/hooks/check-gstack-session.sh
    // fell through to exact-string match, so the wrapped form
    // `[ -x X ] && X || true` did not match the raw incoming `X`. ak setup
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

    await scaffoldAgentHooks({ repoRoot, options: {} })

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

  it('does not duplicate the ak-check-dev-link entry on a second scaffold', async () => {
    await scaffoldAgentHooks({ repoRoot, options: {} })
    await scaffoldAgentHooks({ repoRoot, options: {} })

    const codex = JSON.parse(readFileSync(join(repoRoot, '.codex', 'hooks.json'), 'utf8')) as {
      hooks: { SessionStart: Array<{ hooks: Array<{ command: string }> }> }
    }

    const matches = codex.hooks.SessionStart.flatMap((g) => g.hooks.map((h) => h.command)).filter(
      (cmd) => cmd.includes('ak-check-dev-link'),
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
                command: './node_modules/.bin/ak-pretool-guard',
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
                command: './node_modules/.bin/ak-pretool-guard',
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
                command: './node_modules/.bin/ak-pretool-guard',
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
                command: './node_modules/.bin/ak-pretool-guard',
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
    await trustCodexAgentKitHooksForRepo({
      repoRoot,
      options: {},
      createCodexAppServer: async () => api,
    })

    expect(batchWrites).toHaveLength(1)
  })

  it('can refresh trusted hashes for preset-owned global Codex hooks after setup rewrites ~/.codex/hooks.json', async () => {
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
                command: 'context-mode hook codex pretooluse',
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
                command: 'node "/tmp/oh-my-codex/dist/scripts/codex-native-hook.js"',
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
                command: 'context-mode hook codex pretooluse',
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
                command: 'node "/tmp/oh-my-codex/dist/scripts/codex-native-hook.js"',
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
              [`${globalHooksPath}:pre_tool_use:0:0`]: {
                enabled: true,
                trusted_hash: 'sha256:ctx123',
              },
              [`${globalHooksPath}:pre_tool_use:1:0`]: {
                enabled: true,
                trusted_hash: 'sha256:omx123',
              },
            },
            mergeStrategy: 'upsert',
          },
        ],
        reloadUserConfig: true,
      },
    ])
  })

  it('uses MultiEdit in Claude PreToolUse and PostToolUse matchers', async () => {
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
      settings.hooks.PreToolUse.some((group) => group.matcher === 'Bash|Write|Edit|MultiEdit'),
    ).toBe(true)
    expect(
      settings.hooks.PostToolUse.some((group) => group.matcher === 'Write|Edit|MultiEdit'),
    ).toBe(true)
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
    - command: ak audit agents
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
    expect(stopCommands.some((command) => command.includes('ak-stop-qa'))).toBe(true)
    expect(
      stopCommands.some((command) =>
        command.includes('"$CLAUDE_PROJECT_DIR/node_modules/.bin/ak" audit agents'),
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
    - command: ak audit agents
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
    expect(stopCommands.some((command) => command.includes('ak-stop-qa'))).toBe(true)
    expect(stopCommands.some((command) => command.includes('# from-skill: verify'))).toBe(true)
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
                      '[ -x "$CLAUDE_PROJECT_DIR/node_modules/.bin/ak" ] && "$CLAUDE_PROJECT_DIR/node_modules/.bin/ak" audit agents || true # from-skill: verify',
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
    expect(stopCommands.some((command) => command.includes('ak-stop-qa'))).toBe(true)
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
        g.hooks.some((h) => h.command.includes('ak-sessionstart-routing')),
      ),
    ).toBe(true)
    expect(
      hooks.PreToolUse.some((g) => g.hooks.some((h) => h.command.includes('ak-pretool-guard'))),
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

    await scaffoldAgentHooks({ repoRoot, options: {} })

    const codex = JSON.parse(readFileSync(codexPath, 'utf8')) as Record<string, unknown>
    expect(codex).not.toHaveProperty('SessionStart')
    expect(codex).not.toHaveProperty('PreToolUse')
    expect(codex).toHaveProperty('hooks')

    const hooks = codex.hooks as {
      SessionStart: Array<{ hooks: Array<{ command: string }> }>
      PreToolUse: Array<{ hooks: Array<{ command: string }> }>
    }
    // No duplication — ensureGroup deduped the migrated entries with what we re-add.
    const sessionCmds = hooks.SessionStart.flatMap((g) => g.hooks.map((h) => h.command))
    const sessionAkCount = sessionCmds.filter((c) => c.includes('ak-sessionstart-routing')).length
    expect(sessionAkCount).toBe(1)
  })

  it('rewrites legacy run-agent-kit-bin Codex commands to the guarded installed-bin form without duplicates', async () => {
    const codexPath = join(repoRoot, '.codex', 'hooks.json')
    mkdirSync(join(repoRoot, '.codex'), { recursive: true })
    const legacyRunnerPath = join(repoRoot, 'apps/scripts/src/maintenance/run-agent-kit-bin.ts')
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
                    command: `cd "${repoRoot}" && "/opt/homebrew/bin/bun" "${legacyRunnerPath}" ak-sessionstart-routing`,
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
                    command: `cd "${repoRoot}" && "/opt/homebrew/bin/bun" "${legacyRunnerPath}" ak-pretool-guard`,
                    timeout: 5,
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
      hooks: {
        SessionStart: Array<{ hooks: Array<{ command: string }> }>
        PreToolUse: Array<{ hooks: Array<{ command: string }> }>
      }
    }
    const sessionCommands = codex.hooks.SessionStart.flatMap((group) =>
      group.hooks.map((hook) => hook.command),
    )
    const preToolCommands = codex.hooks.PreToolUse.flatMap((group) =>
      group.hooks.map((hook) => hook.command),
    )

    expect(sessionCommands).toContain(codexBinCommand(repoRoot, 'ak-sessionstart-routing'))
    expect(preToolCommands).toContain(codexBinCommand(repoRoot, 'ak-pretool-guard'))
    expect(
      sessionCommands.filter((command) => command.includes('ak-sessionstart-routing')),
    ).toHaveLength(1)
    expect(preToolCommands.filter((command) => command.includes('ak-pretool-guard'))).toHaveLength(
      1,
    )
    expect(sessionCommands.some((command) => command.includes('run-agent-kit-bin.ts'))).toBe(false)
    expect(preToolCommands.some((command) => command.includes('run-agent-kit-bin.ts'))).toBe(false)
  })

  it('preserves wrapped Codex hooks (e.g. OMX entries) and adds ak-* alongside', async () => {
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
    expect(sessionCmds.some((c) => c.includes('omx/codex-native-hook'))).toBe(true)
    expect(sessionCmds).toContain(codexBinCommand(repoRoot, 'ak-sessionstart-routing'))
  })

  it('writes Codex hook commands as absolute node_modules bin paths', async () => {
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

    expect(sessionCommands).toContain(codexBinCommand(repoRoot, 'ak-sessionstart-routing'))
    expect(preToolCommands).toContain(codexBinCommand(repoRoot, 'ak-pretool-guard'))
    expect(postToolCommands).toContain(codexBinCommand(repoRoot, 'ak-post-tool'))
  })

  it('gracefully no-ops Codex hook commands before node_modules bins exist instead of failing with 127', async () => {
    await scaffoldAgentHooks({ repoRoot, options: {} })

    const siblingCwd = mkdtempSync(join(repoRoot, 'codex-missing-bins-'))
    const codex = JSON.parse(readFileSync(join(repoRoot, '.codex', 'hooks.json'), 'utf8')) as {
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>
    }

    const commands = [
      'SessionStart',
      'PreToolUse',
      'PostToolUse',
      'UserPromptSubmit',
      'Stop',
    ].flatMap((event) =>
      (codex.hooks[event] ?? []).flatMap((group) => group.hooks.map((hook) => hook.command)),
    )

    expect(commands.length).toBeGreaterThan(0)
    for (const command of commands) {
      const result = spawnSync('sh', ['-lc', command], {
        cwd: siblingCwd,
        encoding: 'utf8',
        env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
      })
      expect(result.status, command).toBe(0)
    }
  })

  it('keeps Codex hook commands executable from a sibling cwd instead of failing with 127', async () => {
    await scaffoldAgentHooks({ repoRoot, options: {} })

    const binPath = join(repoRoot, 'node_modules', '.bin', 'ak-pretool-guard')
    mkdirSync(join(repoRoot, 'node_modules', '.bin'), { recursive: true })
    writeFileSync(binPath, '#!/bin/sh\nprintf "{}\\n"\n', 'utf8')
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

    expect(command).toBe(codexBinCommand(repoRoot, 'ak-pretool-guard'))
    expect(result.status).toBe(0)
  })

  it('keeps the Codex Stop hook executable from a sibling cwd instead of failing with 127', async () => {
    await scaffoldAgentHooks({ repoRoot, options: {} })

    const binPath = join(repoRoot, 'node_modules', '.bin', 'ak-stop-qa')
    mkdirSync(join(repoRoot, 'node_modules', '.bin'), { recursive: true })
    writeFileSync(binPath, '#!/bin/sh\nexit 0\n', 'utf8')
    chmodSync(binPath, 0o755)

    const siblingCwd = mkdtempSync(join(repoRoot, 'sibling-stop-'))
    const codex = JSON.parse(readFileSync(join(repoRoot, '.codex', 'hooks.json'), 'utf8')) as {
      hooks: { Stop: Array<{ hooks: Array<{ command: string }> }> }
    }
    const command = codex.hooks.Stop[0]?.hooks[0]?.command

    const result = spawnSync('sh', ['-lc', command ?? ''], {
      cwd: siblingCwd,
      encoding: 'utf8',
    })

    expect(command).toBe(codexBinCommand(repoRoot, 'ak-stop-qa'))
    expect(result.status).toBe(0)
  })

  it('executes every generated Claude hook command successfully from outside repo root', async () => {
    await scaffoldAgentHooks({ repoRoot, options: {} })
    installFakeAgentKitBins(repoRoot)

    const siblingCwd = mkdtempSync(join(repoRoot, 'claude-smoke-'))
    const settings = JSON.parse(
      readFileSync(join(repoRoot, '.claude', 'settings.json'), 'utf8'),
    ) as {
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>
    }

    const commands = [
      'SessionStart',
      'PreToolUse',
      'PostToolUse',
      'UserPromptSubmit',
      'Stop',
    ].flatMap((event) =>
      (settings.hooks[event] ?? []).flatMap((group) => group.hooks.map((hook) => hook.command)),
    )

    expect(commands.length).toBeGreaterThan(0)
    for (const command of commands) {
      const result = spawnSync('sh', ['-lc', command], {
        cwd: siblingCwd,
        encoding: 'utf8',
        env: {
          PATH: '/usr/bin:/bin:/usr/sbin:/sbin',
          HOME: process.env.HOME,
          CLAUDE_PROJECT_DIR: repoRoot,
        },
      })
      expect(result.status, command).toBe(0)
    }
  })

  it('executes every generated Codex hook command successfully from a sibling cwd', async () => {
    await scaffoldAgentHooks({ repoRoot, options: {} })
    installFakeAgentKitBins(repoRoot)

    const siblingCwd = mkdtempSync(join(repoRoot, 'codex-smoke-'))
    const codex = JSON.parse(readFileSync(join(repoRoot, '.codex', 'hooks.json'), 'utf8')) as {
      hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>>
    }

    const commands = [
      'SessionStart',
      'PreToolUse',
      'PostToolUse',
      'UserPromptSubmit',
      'Stop',
    ].flatMap((event) =>
      (codex.hooks[event] ?? []).flatMap((group) => group.hooks.map((hook) => hook.command)),
    )

    expect(commands.length).toBeGreaterThan(0)
    for (const command of commands) {
      const result = spawnSync('sh', ['-lc', command], {
        cwd: siblingCwd,
        encoding: 'utf8',
        env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
      })
      expect(result.status, command).toBe(0)
    }
  })
})

describe('hoistTopLevelEvents', () => {
  it('moves top-level event keys into the wrapped `hooks` key', async () => {
    const input = {
      SessionStart: [
        { hooks: [{ type: 'command', command: './node_modules/.bin/ak-sessionstart-routing' }] },
      ],
      PreToolUse: [
        {
          matcher: 'Bash',
          hooks: [{ type: 'command', command: './node_modules/.bin/ak-pretool-guard' }],
        },
      ],
    }

    const result = hoistTopLevelEvents(input)

    expect(result).not.toHaveProperty('SessionStart')
    expect(result).not.toHaveProperty('PreToolUse')
    expect(result).toHaveProperty('hooks')
    const hooks = result.hooks as Record<string, Array<{ hooks: Array<{ command: string }> }>>
    expect(hooks.SessionStart?.[0]?.hooks[0]?.command).toContain('ak-sessionstart-routing')
    expect(hooks.PreToolUse?.[0]?.hooks[0]?.command).toContain('ak-pretool-guard')
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

  it('dedupes when both top-level and wrapped contain the same ak-* command', async () => {
    const input = {
      SessionStart: [
        { hooks: [{ type: 'command', command: './node_modules/.bin/ak-sessionstart-routing' }] },
      ],
      hooks: {
        SessionStart: [
          { hooks: [{ type: 'command', command: './node_modules/.bin/ak-sessionstart-routing' }] },
        ],
      },
    }

    const result = hoistTopLevelEvents(input)

    const hooks = result.hooks as Record<string, Array<{ hooks: Array<{ command: string }> }>>
    const akCount = (hooks.SessionStart ?? [])
      .flatMap((g) => g.hooks.map((h) => h.command))
      .filter((c) => c.includes('ak-sessionstart-routing')).length
    expect(akCount).toBe(1)
  })

  it('passes through non-event top-level keys untouched', async () => {
    const input = {
      $schema: 'https://example.com/schema.json',
      SessionStart: [
        { hooks: [{ type: 'command', command: './node_modules/.bin/ak-sessionstart-routing' }] },
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
    repoRoot = mkdtempSync(join(tmpdir(), 'ak-agent-hooks-invariant-'))
  })

  afterEach(async () => {
    await import('node:fs/promises').then((fs) => fs.rm(repoRoot, { recursive: true, force: true }))
  })

  it('generated settings.json contains no context-mode hook commands', async () => {
    await scaffoldAgentHooks({ repoRoot, options: {} })

    const settings = JSON.parse(
      readFileSync(join(repoRoot, '.claude', 'settings.json'), 'utf8'),
    ) as { hooks: Record<string, Array<{ hooks: Array<{ command: string }> }>> }

    const allCommands = Object.values(settings.hooks).flatMap((groups) =>
      groups.flatMap((group) => group.hooks.map((hook) => hook.command)),
    )

    for (const command of allCommands) {
      expect(command).not.toContain('context-mode hook')
      expect(command).not.toContain('npx context-mode')
    }
  })

  it('generated settings.json PreToolUse matchers cover only Bash|Write|Edit|MultiEdit and Skill — not Read, Grep, WebFetch, or Agent', async () => {
    await scaffoldAgentHooks({ repoRoot, options: {} })

    const settings = JSON.parse(
      readFileSync(join(repoRoot, '.claude', 'settings.json'), 'utf8'),
    ) as { hooks: { PreToolUse: Array<{ matcher?: string }> } }

    const matchers = settings.hooks.PreToolUse.flatMap((group) =>
      group.matcher ? group.matcher.split('|') : [],
    )

    const forbidden = ['Read', 'Grep', 'WebFetch', 'Agent']
    for (const term of forbidden) {
      expect(matchers).not.toContain(term)
    }
  })
})

describe('buildAgentKitHookGroups', () => {
  it('returns the canonical 5 ak-* event groups with the supplied bin resolver', async () => {
    const result = buildAgentKitHookGroups({
      resolveBin: (name) => `./node_modules/.bin/${name}`,
      matchers: { preToolUse: 'Bash|Edit|Write', postToolUse: 'Edit|Write' },
    })

    expect(Object.keys(result).sort()).toStrictEqual(
      ['PostToolUse', 'PreToolUse', 'SessionStart', 'Stop', 'UserPromptSubmit'].sort(),
    )
    expect(result.SessionStart?.[0]?.hooks[0]?.command).toBe(
      './node_modules/.bin/ak-sessionstart-routing',
    )
    expect(result.PreToolUse?.[0]?.matcher).toBe('Bash|Edit|Write')
    expect(result.PreToolUse?.[0]?.hooks[0]?.command).toBe('./node_modules/.bin/ak-pretool-guard')
    expect(result.PostToolUse?.[0]?.matcher).toBe('Edit|Write')
    expect(result.PostToolUse?.[0]?.hooks[0]?.command).toBe('./node_modules/.bin/ak-post-tool')
    expect(result.UserPromptSubmit?.[0]?.hooks[0]?.command).toBe(
      './node_modules/.bin/ak-guard-switch',
    )
    expect(result.Stop?.[0]?.hooks[0]?.command).toBe('./node_modules/.bin/ak-stop-qa')
  })

  it('substitutes the Claude bin resolver for guarded $CLAUDE_PROJECT_DIR commands', async () => {
    const result = buildAgentKitHookGroups({
      resolveBin: (name) =>
        `[ -x "$CLAUDE_PROJECT_DIR/node_modules/.bin/${name}" ] && "$CLAUDE_PROJECT_DIR/node_modules/.bin/${name}" || true`,
      matchers: { preToolUse: 'Bash|Write|Edit|MultiEdit', postToolUse: 'Write|Edit|MultiEdit' },
    })

    expect(result.SessionStart?.[0]?.hooks[0]?.command).toContain('$CLAUDE_PROJECT_DIR')
    expect(result.SessionStart?.[0]?.hooks[0]?.command).toContain('ak-sessionstart-routing')
    expect(result.PreToolUse?.[0]?.matcher).toBe('Bash|Write|Edit|MultiEdit')
  })
})
