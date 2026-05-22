import { mkdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { auditAgents } from './agents.js'

function makeTempDir(): string {
  return join(tmpdir(), `ak-audit-agents-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`)
}

function seedConsumerRepo(root: string): void {
  mkdirSync(join(root, '.agent', 'rules'), { recursive: true })
  mkdirSync(join(root, '.claude', 'rules'), { recursive: true })
  mkdirSync(join(root, '.claude', 'agents'), { recursive: true })
  mkdirSync(join(root, '.codex'), { recursive: true })

  writeFileSync(join(root, 'AGENTS.md'), '# Root contract\n')
  writeJson(join(root, 'package.json'), {
    name: 'consumer-app',
    scripts: { 'setup:agent': 'ak setup' },
    devDependencies: { '@webpresso/agent-kit': '^0.2.0' },
  })
  writeJson(join(root, '.agent-kitrc.json'), {
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
        { hooks: [{ type: 'command', command: './node_modules/.bin/ak-sessionstart-routing' }] },
      ],
      PreToolUse: [
        {
          matcher: 'Bash|Write|Edit',
          hooks: [{ type: 'command', command: './node_modules/.bin/ak-pretool-guard' }],
        },
      ],
      PostToolUse: [
        {
          matcher: 'Write|Edit',
          hooks: [{ type: 'command', command: './node_modules/.bin/ak-post-tool' }],
        },
      ],
      UserPromptSubmit: [
        { hooks: [{ type: 'command', command: './node_modules/.bin/ak-guard-switch' }] },
      ],
      Stop: [{ hooks: [{ type: 'command', command: './node_modules/.bin/ak-stop-qa' }] }],
    },
  })
  // Canonical Codex schema is wrapped under "hooks" — matches what the
  // agent-hooks scaffolder writes via hoistTopLevelEvents.
  writeJson(join(root, '.codex', 'hooks.json'), {
    hooks: {
      SessionStart: [
        { hooks: [{ type: 'command', command: './node_modules/.bin/ak-sessionstart-routing' }] },
      ],
      PreToolUse: [
        {
          matcher: 'Bash|Edit|Write',
          hooks: [{ type: 'command', command: './node_modules/.bin/ak-pretool-guard' }],
        },
      ],
      PostToolUse: [
        {
          matcher: 'Edit|Write',
          hooks: [{ type: 'command', command: './node_modules/.bin/ak-post-tool' }],
        },
      ],
      UserPromptSubmit: [
        { hooks: [{ type: 'command', command: './node_modules/.bin/ak-guard-switch' }] },
      ],
      Stop: [{ hooks: [{ type: 'command', command: './node_modules/.bin/ak-stop-qa' }] }],
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
      scripts: { 'setup:agent': 'vp exec ak setup' },
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

  it('skips devDep check when globalInstall is true in .agent-kitrc.json', () => {
    seedConsumerRepo(root)
    // Remove the devDep — this is what globalInstall repos look like
    writeJson(join(root, 'package.json'), {
      name: 'consumer-app',
      scripts: { 'setup:agent': 'ak setup' },
      devDependencies: {},
    })
    writeJson(join(root, '.agent-kitrc.json'), {
      version: '1',
      installed: { tier3Skills: [] },
      rules: { overrides: ['custom-rule'] },
      scripts: {},
      durablePlanningRoot: '.agent/planning/',
      globalInstall: true,
    })

    const result = auditAgents(root)
    expect(result.violations.some((v) => v.message.includes('@webpresso/agent-kit'))).toBe(false)
  })

  it('fails devDep check when globalInstall is absent and devDep is missing', () => {
    seedConsumerRepo(root)
    writeJson(join(root, 'package.json'), {
      name: 'consumer-app',
      scripts: { 'setup:agent': 'ak setup' },
      devDependencies: {},
    })

    const result = auditAgents(root)
    expect(result.violations.some((v) => v.message.includes('@webpresso/agent-kit'))).toBe(true)
  })

  it('passes for the self-hosting repo shape without .claude/settings.json', () => {
    mkdirSync(join(root, '.agent', 'rules'), { recursive: true })
    mkdirSync(join(root, '.claude', 'rules'), { recursive: true })
    mkdirSync(join(root, '.claude', 'agents'), { recursive: true })
    mkdirSync(join(root, '.codex'), { recursive: true })
    mkdirSync(join(root, 'catalog', 'agent', 'agents'), { recursive: true })
    writeFileSync(join(root, 'AGENTS.md'), '# Root contract\n')
    writeJson(join(root, 'package.json'), { name: '@webpresso/agent-kit' })
    writeJson(join(root, '.codex', 'hooks.json'), {
      SessionStart: [
        { hooks: [{ type: 'command', command: './node_modules/.bin/ak-sessionstart-routing' }] },
      ],
      PreToolUse: [
        {
          matcher: 'Bash|Edit|Write',
          hooks: [{ type: 'command', command: './node_modules/.bin/ak-pretool-guard' }],
        },
      ],
      PostToolUse: [
        {
          matcher: 'Edit|Write',
          hooks: [{ type: 'command', command: './node_modules/.bin/ak-post-tool' }],
        },
      ],
      UserPromptSubmit: [
        { hooks: [{ type: 'command', command: './node_modules/.bin/ak-guard-switch' }] },
      ],
      Stop: [{ hooks: [{ type: 'command', command: './node_modules/.bin/ak-stop-qa' }] }],
    })
    writeFileSync(join(root, '.agent', 'rules', 'repo-restrictions.md'), '# rule\n')
    symlinkSync(
      '../../.agent/rules/repo-restrictions.md',
      join(root, '.claude', 'rules', 'repo-restrictions.md'),
    )
    for (const agentName of ['code-reviewer', 'security-auditor', 'doc-writer', 'explorer']) {
      writeFileSync(join(root, 'catalog', 'agent', 'agents', `${agentName}.md`), `# ${agentName}\n`)
      symlinkSync(
        join('..', '..', 'catalog', 'agent', 'agents', `${agentName}.md`),
        join(root, '.claude', 'agents', `${agentName}.md`),
      )
    }

    const result = auditAgents(root)
    expect(result.ok).toBe(true)
  })
})
