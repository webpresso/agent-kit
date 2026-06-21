import { describe, expect, it, vi } from 'vitest'

import { ensureGstack } from './index.js'

describe('Webpresso gstack migration contract', () => {
  it('setup no longer shells out to git clone/pull or upstream setup', async () => {
    const run = vi.fn()
    const result = await ensureGstack({
      repoRoot: '/repo',
      packageRoot: '/pkg',
      claudeSkillsRoot: '/home/.claude/skills',
      codexSkillsRoot: '/home/.codex/skills',
      codexConfigPath: '/home/.codex/config.toml',
      installRoot: '/home/.claude/skills/gstack',
      options: { dryRun: false, overwrite: false },
      detectCodex: () => false,
      exists: (target) => String(target).startsWith('/pkg/catalog/agent/skills'),
      mkdir: vi.fn(),
      cp: vi.fn(),
    })

    expect(result.kind).toBe('gstack-installed')
    expect(run).not.toHaveBeenCalled()
  })
})
