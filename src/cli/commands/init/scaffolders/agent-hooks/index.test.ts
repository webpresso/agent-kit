import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { buildAgentKitHookGroups, hoistTopLevelEvents, scaffoldAgentHooks } from './index.js'

describe('scaffoldAgentHooks', () => {
  let repoRoot: string

  beforeEach(() => {
    repoRoot = mkdtempSync(join(tmpdir(), 'ak-agent-hooks-'))
  })

  afterEach(async () => {
    await import('node:fs/promises').then((fs) => fs.rm(repoRoot, { recursive: true, force: true }))
  })

  it('adds .claude to worktree.symlinkDirectories when missing', () => {
    scaffoldAgentHooks({ repoRoot, options: {} })

    const settings = JSON.parse(
      readFileSync(join(repoRoot, '.claude', 'settings.json'), 'utf8'),
    ) as {
      worktree: { symlinkDirectories: string[] }
    }

    expect(settings.worktree.symlinkDirectories).toContain('.claude')
  })

  it('preserves existing symlinkDirectories and adds .claude additively', () => {
    const settingsPath = join(repoRoot, '.claude', 'settings.json')
    mkdirSync(join(repoRoot, '.claude'), { recursive: true })
    writeFileSync(
      settingsPath,
      JSON.stringify({ worktree: { symlinkDirectories: ['node_modules'] } }, null, 2),
    )

    scaffoldAgentHooks({ repoRoot, options: {} })

    const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
      worktree: { symlinkDirectories: string[] }
    }
    expect(settings.worktree.symlinkDirectories).toEqual(['node_modules', '.claude'])
  })

  it('does not duplicate .claude in symlinkDirectories', () => {
    const settingsPath = join(repoRoot, '.claude', 'settings.json')
    mkdirSync(join(repoRoot, '.claude'), { recursive: true })
    writeFileSync(
      settingsPath,
      JSON.stringify({ worktree: { symlinkDirectories: ['.claude'] } }, null, 2),
    )

    scaffoldAgentHooks({ repoRoot, options: {} })

    const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
      worktree: { symlinkDirectories: string[] }
    }
    expect(settings.worktree.symlinkDirectories).toEqual(['.claude'])
  })

  it('does not create .claude/hooks in dry-run mode', () => {
    scaffoldAgentHooks({ repoRoot, options: { dryRun: true } })

    expect(() =>
      readFileSync(join(repoRoot, '.claude', 'hooks', 'check-gstack.sh'), 'utf8'),
    ).toThrow()
  })

  it('wires ak-check-dev-link as a SessionStart hook in both Claude and Codex', () => {
    scaffoldAgentHooks({ repoRoot, options: {} })

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
    expect(codexCommands).toContain('./node_modules/.bin/ak-check-dev-link')
  })

  it('dedupes pre-existing wrapped script hooks against the raw incoming form', () => {
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

    scaffoldAgentHooks({ repoRoot, options: {} })

    const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
      hooks: { SessionStart: Array<{ hooks: Array<{ command: string }> }> }
    }
    const gstackMatches = settings.hooks.SessionStart.flatMap((g) =>
      g.hooks.map((h) => h.command),
    ).filter((cmd) => cmd.includes('check-gstack-session.sh'))
    expect(gstackMatches).toHaveLength(1)
    expect(gstackMatches[0]).toBe(wrappedGstack)
  })

  it('dedupes pre-existing wrapped Skill matcher hooks against the raw incoming form', () => {
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

    scaffoldAgentHooks({ repoRoot, options: {} })

    const settings = JSON.parse(readFileSync(settingsPath, 'utf8')) as {
      hooks: { PreToolUse: Array<{ matcher?: string; hooks: Array<{ command: string }> }> }
    }
    const gstackSkillMatches = settings.hooks.PreToolUse.flatMap((g) =>
      g.hooks.map((h) => h.command),
    ).filter((cmd) => cmd.includes('check-gstack.sh'))
    expect(gstackSkillMatches).toHaveLength(1)
  })

  it('does not duplicate the ak-check-dev-link entry on a second scaffold', () => {
    scaffoldAgentHooks({ repoRoot, options: {} })
    scaffoldAgentHooks({ repoRoot, options: {} })

    const codex = JSON.parse(readFileSync(join(repoRoot, '.codex', 'hooks.json'), 'utf8')) as {
      hooks: { SessionStart: Array<{ hooks: Array<{ command: string }> }> }
    }

    const matches = codex.hooks.SessionStart.flatMap((g) => g.hooks.map((h) => h.command)).filter(
      (cmd) => cmd.includes('ak-check-dev-link'),
    )
    expect(matches).toHaveLength(1)
  })

  it('uses MultiEdit in Claude PreToolUse and PostToolUse matchers', () => {
    scaffoldAgentHooks({ repoRoot, options: {} })

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

  it('merges verify skill Stop hooks alongside the global Stop hook', () => {
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

    scaffoldAgentHooks({ repoRoot, options: {} })

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

  it('preserves verify skill Stop hooks on a second run', () => {
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

    scaffoldAgentHooks({ repoRoot, options: {} })
    scaffoldAgentHooks({ repoRoot, options: {} })

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

  it('removes stale skill-managed hooks when the skill is no longer installed', () => {
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

    scaffoldAgentHooks({ repoRoot, options: {} })

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

  it('writes Codex hooks under the canonical wrapped `hooks` key, not at top level', () => {
    scaffoldAgentHooks({ repoRoot, options: {} })

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

  it('migrates legacy flat-form Codex hooks.json into the wrapped `hooks` key', () => {
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

    scaffoldAgentHooks({ repoRoot, options: {} })

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

  it('preserves wrapped Codex hooks (e.g. OMX entries) and adds ak-* alongside', () => {
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

    scaffoldAgentHooks({ repoRoot, options: {} })

    const codex = JSON.parse(readFileSync(codexPath, 'utf8')) as {
      hooks: { SessionStart: Array<{ hooks: Array<{ command: string }> }> }
    }
    const sessionCmds = codex.hooks.SessionStart.flatMap((g) => g.hooks.map((h) => h.command))
    expect(sessionCmds.some((c) => c.includes('omx/codex-native-hook'))).toBe(true)
    expect(sessionCmds.some((c) => c.includes('ak-sessionstart-routing'))).toBe(true)
  })
})

describe('hoistTopLevelEvents', () => {
  it('moves top-level event keys into the wrapped `hooks` key', () => {
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

  it('leaves already-wrapped input unchanged in shape (idempotent)', () => {
    const input = {
      hooks: {
        SessionStart: [{ hooks: [{ type: 'command', command: 'node /opt/omx/hook.js' }] }],
      },
    }

    const result = hoistTopLevelEvents(input)

    expect(result).toStrictEqual(input)
  })

  it('dedupes when both top-level and wrapped contain the same ak-* command', () => {
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

  it('passes through non-event top-level keys untouched', () => {
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

  it('generated settings.json contains no context-mode hook commands', () => {
    scaffoldAgentHooks({ repoRoot, options: {} })

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

  it('generated settings.json PreToolUse matchers cover only Bash|Write|Edit|MultiEdit and Skill — not Read, Grep, WebFetch, or Agent', () => {
    scaffoldAgentHooks({ repoRoot, options: {} })

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
  it('returns the canonical 5 ak-* event groups with the supplied bin resolver', () => {
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

  it('substitutes the Claude bin resolver for guarded $CLAUDE_PROJECT_DIR commands', () => {
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
