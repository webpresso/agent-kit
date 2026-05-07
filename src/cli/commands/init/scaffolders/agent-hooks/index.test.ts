import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { scaffoldAgentHooks } from './index.js'

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

    const settings = JSON.parse(readFileSync(join(repoRoot, '.claude', 'settings.json'), 'utf8')) as {
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

    expect(() => readFileSync(join(repoRoot, '.claude', 'hooks', 'check-gstack.sh'), 'utf8')).toThrow()
  })

  it('uses MultiEdit in Claude PreToolUse and PostToolUse matchers', () => {
    scaffoldAgentHooks({ repoRoot, options: {} })

    const settings = JSON.parse(readFileSync(join(repoRoot, '.claude', 'settings.json'), 'utf8')) as {
      hooks: {
        PreToolUse: Array<{ matcher?: string }>
        PostToolUse: Array<{ matcher?: string }>
      }
    }

    expect(settings.hooks.PreToolUse.some((group) => group.matcher === 'Bash|Write|Edit|MultiEdit')).toBe(true)
    expect(settings.hooks.PostToolUse.some((group) => group.matcher === 'Write|Edit|MultiEdit')).toBe(true)
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

    const settings = JSON.parse(readFileSync(join(repoRoot, '.claude', 'settings.json'), 'utf8')) as {
      hooks: {
        Stop: Array<{ hooks: Array<{ command: string }> }>
      }
    }

    const stopCommands = settings.hooks.Stop.flatMap((group) => group.hooks.map((hook) => hook.command))
    expect(stopCommands.some((command) => command.includes('ak-stop-qa'))).toBe(true)
    expect(stopCommands.some((command) => command.includes('"$CLAUDE_PROJECT_DIR/node_modules/.bin/ak" audit agents'))).toBe(true)
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

    const settings = JSON.parse(readFileSync(join(repoRoot, '.claude', 'settings.json'), 'utf8')) as {
      hooks: {
        Stop: Array<{ hooks: Array<{ command: string }> }>
      }
    }

    const stopCommands = settings.hooks.Stop.flatMap((group) => group.hooks.map((hook) => hook.command))
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
    const stopCommands = settings.hooks.Stop.flatMap((group) => group.hooks.map((hook) => hook.command))

    expect(stopCommands.some((command) => command.includes('# from-skill: verify'))).toBe(false)
    expect(stopCommands.some((command) => command.includes('ak-stop-qa'))).toBe(true)
  })
})
