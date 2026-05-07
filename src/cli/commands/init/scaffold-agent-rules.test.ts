import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { scaffoldAgentRules } from './scaffold-agent-rules.js'

describe('scaffoldAgentRules', () => {
  let cwd: string

  beforeEach(() => {
    cwd = join(tmpdir(), `ak-agent-rules-${Date.now()}-${Math.random().toString(36).slice(2)}`)
    mkdirSync(cwd, { recursive: true })
  })

  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true })
  })

  it('creates dir, .gitkeep, README, and patches .gitignore on a fresh repo', () => {
    const { results } = scaffoldAgentRules({ cwd })
    const actions = results.map((r) => r.action)
    expect(actions.every((a) => a === 'created')).toBe(true)

    expect(existsSync(join(cwd, 'agent-rules', '.gitkeep'))).toBe(true)
    expect(readFileSync(join(cwd, 'agent-rules', 'README.md'), 'utf8')).toContain('agent-rules/')

    const gi = readFileSync(join(cwd, '.gitignore'), 'utf8')
    expect(gi).toContain('# >>> managed by @webpresso/agent-kit (rule-sync)')
    expect(gi).toContain('.agent/rules/')
    expect(gi).toContain('.cursor/rules/')
    expect(gi).toContain('# <<< managed by @webpresso/agent-kit (rule-sync)')
    // README must not leak the marker comment
    expect(readFileSync(join(cwd, 'agent-rules', 'README.md'), 'utf8')).not.toContain(
      'managed by @webpresso/agent-kit',
    )
  })

  it('is idempotent on second run (all identical, no mutations)', () => {
    scaffoldAgentRules({ cwd })
    const giBefore = readFileSync(join(cwd, '.gitignore'), 'utf8')
    const readmeBefore = readFileSync(join(cwd, 'agent-rules', 'README.md'), 'utf8')

    const { results } = scaffoldAgentRules({ cwd })
    expect(results.every((r) => r.action === 'identical')).toBe(true)

    expect(readFileSync(join(cwd, '.gitignore'), 'utf8')).toBe(giBefore)
    expect(readFileSync(join(cwd, 'agent-rules', 'README.md'), 'utf8')).toBe(readmeBefore)
  })

  it('preserves an existing .gitignore block from another scaffolder', () => {
    const existing = `node_modules/\n.agent/\n# >>> managed by @webpresso/agent-kit (omx)\n.omx/cache/\n# <<< managed by @webpresso/agent-kit (omx)\n`
    writeFileSync(join(cwd, '.gitignore'), existing)

    scaffoldAgentRules({ cwd })

    const gi = readFileSync(join(cwd, '.gitignore'), 'utf8')
    // pre-existing block intact
    expect(gi).toContain('# >>> managed by @webpresso/agent-kit (omx)')
    expect(gi).toContain('.omx/cache/')
    expect(gi).toContain('# <<< managed by @webpresso/agent-kit (omx)')
    // hand-written line intact
    expect(gi).toContain('node_modules/')
    expect(gi).toContain('.agent/')
    // new block appended exactly once
    const occurrences = gi.split('# >>> managed by @webpresso/agent-kit (rule-sync)').length - 1
    expect(occurrences).toBe(1)
  })

  it('dryRun writes nothing and returns skipped-dry', () => {
    const { results } = scaffoldAgentRules({ cwd, dryRun: true })
    expect(results.every((r) => r.action === 'skipped-dry')).toBe(true)
    expect(existsSync(join(cwd, 'agent-rules'))).toBe(false)
    expect(existsSync(join(cwd, '.gitignore'))).toBe(false)
  })

  it('overwrite rewrites a hand-edited README to canonical content', () => {
    scaffoldAgentRules({ cwd })
    const readmePath = join(cwd, 'agent-rules', 'README.md')
    writeFileSync(readmePath, '# tampered\n')

    const { results } = scaffoldAgentRules({ cwd, overwrite: true })
    const readmeResult = results.find((r) => r.targetPath === readmePath)
    expect(readmeResult?.action).toBe('overwritten')
    expect(readFileSync(readmePath, 'utf8')).toContain('ak rule new')
  })
})
