import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { scaffoldAgentRules } from './scaffold-agent-rules.js'
import { scaffoldAgentSkills } from './scaffold-agent-skills.js'

describe('scaffoldAgentSkills', () => {
  let cwd: string

  beforeEach(() => {
    cwd = join(tmpdir(), `wp-agent-skills-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(cwd, { recursive: true })
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  it('creates dir, .gitkeep, README, and patches .gitignore on a fresh repo', () => {
    const { results } = scaffoldAgentSkills({ cwd })
    const actions = results.map((r) => r.action)
    expect(actions.every((a) => a === 'created')).toBe(true)

    expect(existsSync(join(cwd, 'agent-skills', '.gitkeep'))).toBe(true)
    expect(readFileSync(join(cwd, 'agent-skills', 'README.md'), 'utf8')).toContain('agent-skills/')

    const gi = readFileSync(join(cwd, '.gitignore'), 'utf8')
    expect(gi).toContain('# >>> managed by webpresso (skill-sync)')
    expect(gi).toContain('.agent/skills/')
    expect(gi).toContain('.claude/skills/')
    expect(gi).toContain('# <<< managed by webpresso (skill-sync)')
    expect(readFileSync(join(cwd, 'agent-skills', 'README.md'), 'utf8')).not.toContain(
      'managed by webpresso',
    )
  })

  it('is idempotent on second run (all identical, no mutations)', () => {
    scaffoldAgentSkills({ cwd })
    const giBefore = readFileSync(join(cwd, '.gitignore'), 'utf8')
    const readmeBefore = readFileSync(join(cwd, 'agent-skills', 'README.md'), 'utf8')

    const { results } = scaffoldAgentSkills({ cwd })
    expect(results.every((r) => r.action === 'identical')).toBe(true)

    expect(readFileSync(join(cwd, '.gitignore'), 'utf8')).toBe(giBefore)
    expect(readFileSync(join(cwd, 'agent-skills', 'README.md'), 'utf8')).toBe(readmeBefore)
  })

  it('preserves an existing .gitignore block from another scaffolder', () => {
    const existing = `node_modules/\n.agent/\n# >>> managed by webpresso (omx)\n.omx/cache/\n# <<< managed by webpresso (omx)\n`
    writeFileSync(join(cwd, '.gitignore'), existing)

    scaffoldAgentSkills({ cwd })

    const gi = readFileSync(join(cwd, '.gitignore'), 'utf8')
    expect(gi).toContain('# >>> managed by webpresso (omx)')
    expect(gi).toContain('.omx/cache/')
    expect(gi).toContain('node_modules/')
    expect(gi).toContain('.agent/')
    const occurrences = gi.split('# >>> managed by webpresso (skill-sync)').length - 1
    expect(occurrences).toBe(1)
  })

  it('dryRun writes nothing and returns skipped-dry', () => {
    const { results } = scaffoldAgentSkills({ cwd, dryRun: true })
    expect(results.every((r) => r.action === 'skipped-dry')).toBe(true)
    expect(existsSync(join(cwd, 'agent-skills'))).toBe(false)
    expect(existsSync(join(cwd, '.gitignore'))).toBe(false)
  })

  it('overwrite rewrites a hand-edited README to canonical content', () => {
    scaffoldAgentSkills({ cwd })
    const readmePath = join(cwd, 'agent-skills', 'README.md')
    writeFileSync(readmePath, '# tampered\n')

    const { results } = scaffoldAgentSkills({ cwd, overwrite: true })
    const readmeResult = results.find((r) => r.targetPath === readmePath)
    expect(readmeResult?.action).toBe('overwritten')
    expect(readFileSync(readmePath, 'utf8')).toContain('wp skill new')
  })

  it('two scaffolders share .gitignore without colliding', () => {
    scaffoldAgentRules({ cwd })
    scaffoldAgentSkills({ cwd })

    const gi = readFileSync(join(cwd, '.gitignore'), 'utf8')
    expect(gi).toContain('# >>> managed by webpresso (rule-sync)')
    expect(gi).toContain('# >>> managed by webpresso (skill-sync)')

    // Re-running both is idempotent
    const r1 = scaffoldAgentRules({ cwd })
    const r2 = scaffoldAgentSkills({ cwd })
    expect(r1.results.every((r) => r.action === 'identical')).toBe(true)
    expect(r2.results.every((r) => r.action === 'identical')).toBe(true)
  })
})
