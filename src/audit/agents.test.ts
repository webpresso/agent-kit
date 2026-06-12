import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { auditAgents } from './agents.js'

function makeTempDir(): string {
  return join(tmpdir(), `wp-audit-agents-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function managedCodexHookCommand(root: string, binName: string): string {
  return join(root, '.codex', 'managed-hooks', `${binName}.sh`)
}

function managedClaudeHookCommand(binName: string): string {
  return `$CLAUDE_PROJECT_DIR/.claude/hooks/managed/${binName}.sh`
}

function seedConsumerRepo(root: string): void {
  mkdirSync(join(root, '.agent', 'rules'), { recursive: true })
  mkdirSync(join(root, '.claude', 'rules'), { recursive: true })
  mkdirSync(join(root, '.claude', 'agents'), { recursive: true })
  mkdirSync(join(root, '.codex'), { recursive: true })

  writeFileSync(join(root, 'AGENTS.md'), '# Root contract\n')
  writeJson(join(root, 'package.json'), {
    name: 'consumer-app',
    scripts: { 'setup:agent': 'wp setup' },
    devDependencies: { '@webpresso/agent-kit': '^0.2.0' },
  })
  writeJson(join(root, '.webpressorc.json'), {
    version: '1',
    installed: { tier3Skills: [] },
    rules: { overrides: ['custom-rule'] },
    scripts: {},
    durablePlanningRoot: '.agent/planning/',
  })
  writeJson(join(root, '.claude', 'settings.json'), {
    worktree: { symlinkDirectories: ['.claude'] },
    hooks: {
      SessionStart: [
        {
          hooks: [
            { type: 'command', command: managedClaudeHookCommand('wp-sessionstart-routing') },
          ],
        },
      ],
      PreToolUse: [
        {
          matcher: 'Bash|Write|Edit',
          hooks: [{ type: 'command', command: managedClaudeHookCommand('wp-pretool-guard') }],
        },
      ],
      PostToolUse: [
        {
          matcher: 'Write|Edit',
          hooks: [{ type: 'command', command: managedClaudeHookCommand('wp-post-tool') }],
        },
      ],
      UserPromptSubmit: [
        { hooks: [{ type: 'command', command: managedClaudeHookCommand('wp-guard-switch') }] },
      ],
      Stop: [{ hooks: [{ type: 'command', command: managedClaudeHookCommand('wp-stop-qa') }] }],
    },
  })
  // Canonical Codex schema is wrapped under "hooks" — matches what the
  // agent-hooks scaffolder writes via hoistTopLevelEvents.
  writeJson(join(root, '.codex', 'hooks.json'), {
    hooks: {
      SessionStart: [
        {
          hooks: [
            {
              type: 'command',
              command: managedCodexHookCommand(root, 'wp-sessionstart-routing'),
            },
          ],
        },
      ],
      PreToolUse: [
        {
          matcher: 'Bash|Edit|Write',
          hooks: [{ type: 'command', command: managedCodexHookCommand(root, 'wp-pretool-guard') }],
        },
      ],
      PostToolUse: [
        {
          matcher: 'Edit|Write',
          hooks: [{ type: 'command', command: managedCodexHookCommand(root, 'wp-post-tool') }],
        },
      ],
      UserPromptSubmit: [
        { hooks: [{ type: 'command', command: managedCodexHookCommand(root, 'wp-guard-switch') }] },
      ],
      Stop: [
        { hooks: [{ type: 'command', command: managedCodexHookCommand(root, 'wp-stop-qa') }] },
      ],
    },
  })

  writeFileSync(join(root, '.agent', 'rules', 'repo-restrictions.md'), '# rule\n')
  writeFileSync(join(root, '.agent', 'rules', 'custom-rule.md'), '# custom\n')
  symlinkSync(
    '../../.agent/rules/repo-restrictions.md',
    join(root, '.claude', 'rules', 'repo-restrictions.md'),
  )
  writeFileSync(join(root, '.claude', 'rules', 'custom-rule.md'), '# override content\n')

  for (const agentName of ['code-reviewer', 'security-auditor', 'doc-writer', 'explorer']) {
    mkdirSync(join(root, 'node_modules', '@webpresso', 'agent-kit', 'catalog', 'agent', 'agents'), {
      recursive: true,
    })
    writeFileSync(
      join(
        root,
        'node_modules',
        '@webpresso',
        'agent-kit',
        'catalog',
        'agent',
        'agents',
        `${agentName}.md`,
      ),
      `# ${agentName}\n`,
    )
    symlinkSync(
      join(
        '..',
        '..',
        'node_modules',
        '@webpresso',
        'agent-kit',
        'catalog',
        'agent',
        'agents',
        `${agentName}.md`,
      ),
      join(root, '.claude', 'agents', `${agentName}.md`),
    )
  }
}

describe('auditAgents', () => {
  let root: string

  beforeEach(() => {
    root = makeTempDir()
    mkdirSync(root, { recursive: true })
  })

  afterEach(async () => {
    await import('node:fs/promises').then((fs) => fs.rm(root, { recursive: true, force: true }))
  })

  it('passes for a consumer repo with synced hooks, rules, and overrides', () => {
    seedConsumerRepo(root)

    const result = auditAgents(root)
    expect(result.ok).toBe(true)
    expect(result.violations).toEqual([])
  })

  it('fails when setup:agent is missing or wrong', () => {
    seedConsumerRepo(root)
    writeJson(join(root, 'package.json'), {
      name: 'consumer-app',
      scripts: { 'setup:agent': 'vp exec wp setup' },
      devDependencies: { '@webpresso/agent-kit': '^0.2.0' },
    })

    const result = auditAgents(root)
    expect(result.ok).toBe(false)
    expect(result.violations.some((v) => v.message.includes('scripts.setup:agent'))).toBe(true)
  })

  it('fails when a required Claude hook is missing', () => {
    seedConsumerRepo(root)
    writeJson(join(root, '.claude', 'settings.json'), {
      worktree: { symlinkDirectories: ['.claude'] },
      hooks: {},
    })

    const result = auditAgents(root)
    expect(result.ok).toBe(false)
    expect(result.violations.some((v) => v.message.includes('Missing SessionStart hook'))).toBe(
      true,
    )
  })

  it('fails when a canonical Claude subagent is missing', () => {
    seedConsumerRepo(root)
    rmSync(join(root, '.claude', 'agents', 'explorer.md'))

    const result = auditAgents(root)
    expect(result.ok).toBe(false)
    expect(
      result.violations.some((v) => v.message.includes('Missing Claude subagent explorer.md')),
    ).toBe(true)
  })

  it('fails devDep check when the package pin is missing', () => {
    seedConsumerRepo(root)
    writeJson(join(root, 'package.json'), {
      name: 'consumer-app',
      scripts: { 'setup:agent': 'wp setup' },
      devDependencies: {},
    })

    const result = auditAgents(root)
    expect(result.violations.some((v) => v.message.includes('@webpresso/agent-kit'))).toBe(true)
  })

  it('passes for the self-hosting repo shape using catalog sources only', () => {
    mkdirSync(join(root, 'catalog', 'agent', 'agents'), { recursive: true })
    mkdirSync(join(root, 'catalog', 'agent', 'rules'), { recursive: true })
    writeFileSync(join(root, 'AGENTS.md'), '# Root contract\n')
    writeJson(join(root, 'package.json'), { name: '@webpresso/agent-kit' })
    writeFileSync(join(root, 'catalog', 'agent', 'rules', 'repo-restrictions.md'), '# rule\n')
    for (const agentName of ['code-reviewer', 'security-auditor', 'doc-writer', 'explorer']) {
      writeFileSync(join(root, 'catalog', 'agent', 'agents', `${agentName}.md`), `# ${agentName}\n`)
    }

    const result = auditAgents(root)
    expect(result.ok).toBe(true)
  })
})
