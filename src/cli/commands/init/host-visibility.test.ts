import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  REQUIRED_CORE_CAPABILITIES,
  auditHostSkillVisibility,
  hostSkillRoots,
  parseAgentHosts,
} from './host-visibility.js'

function makeTempDir(): string {
  return join(tmpdir(), `host-visibility-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
}

function writeSkill(root: string, slug: string): void {
  mkdirSync(join(root, slug), { recursive: true })
  writeFileSync(join(root, slug, 'SKILL.md'), `---\nname: ${slug}\n---\n`)
}

describe('host skill visibility', () => {
  let repoRoot: string
  let homeDir: string

  beforeEach(() => {
    repoRoot = makeTempDir()
    homeDir = makeTempDir()
    mkdirSync(repoRoot, { recursive: true })
    mkdirSync(homeDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true })
    rmSync(homeDir, { recursive: true, force: true })
  })

  it('treats verify and plan-refine as core required capabilities', () => {
    expect(REQUIRED_CORE_CAPABILITIES).toEqual(['verify', 'plan-refine'])
  })

  it('parses explicit host selections without aliases', () => {
    expect(parseAgentHosts(undefined)).toEqual(['codex', 'claude', 'opencode'])
    expect(parseAgentHosts('all')).toEqual(['codex', 'claude', 'opencode'])
    expect(parseAgentHosts('none')).toEqual([])
    expect(parseAgentHosts('codex,opencode')).toEqual(['codex', 'opencode'])
    expect(() => parseAgentHosts('legacy-codex')).toThrow(/Unknown host/)
  })

  it('uses .agents/skills for Codex and ignores .codex/agents as a skill root', () => {
    writeSkill(join(repoRoot, '.codex', 'agents'), 'verify')

    const missing = auditHostSkillVisibility({
      repoRoot,
      homeDir,
      hosts: ['codex'],
      requiredCapabilities: ['verify'],
    })
    expect(missing.results[0]?.status).toBe('not-visible')

    writeSkill(join(repoRoot, '.agents', 'skills'), 'verify')
    const visible = auditHostSkillVisibility({
      repoRoot,
      homeDir,
      hosts: ['codex'],
      requiredCapabilities: ['verify'],
    })
    expect(visible.results[0]?.status).toBe('visible-after-restart')
    expect(visible.results[0]?.foundPaths[0]).toContain(join('.agents', 'skills'))
  })

  it('recognizes OpenCode project skill roots from official docs', () => {
    const roots = hostSkillRoots(repoRoot, 'opencode', homeDir)
    expect(roots.project).toEqual([
      join(repoRoot, '.opencode', 'skills'),
      join(repoRoot, '.claude', 'skills'),
      join(repoRoot, '.agents', 'skills'),
    ])

    writeSkill(join(repoRoot, '.opencode', 'skills'), 'verify')
    writeSkill(join(repoRoot, '.claude', 'skills'), 'plan-refine')

    const audit = auditHostSkillVisibility({ repoRoot, homeDir, hosts: ['opencode'] })
    expect(audit.results.map((r) => [r.capability, r.status])).toEqual([
      ['verify', 'visible-after-restart'],
      ['plan-refine', 'visible-after-restart'],
    ])
  })

  it('marks skills visible now only when the current session reports those slugs live', () => {
    writeSkill(join(repoRoot, '.claude', 'skills'), 'verify')
    const audit = auditHostSkillVisibility({
      repoRoot,
      homeDir,
      hosts: ['claude'],
      requiredCapabilities: ['verify'],
      liveSkillSlugs: new Set(['verify']),
    })
    expect(audit.results[0]?.status).toBe('visible-now')
    expect(audit.results[0]?.restartRequired).toBe(false)
  })

  it('audits no host capabilities when host selection is empty', () => {
    const audit = auditHostSkillVisibility({ repoRoot, homeDir, hosts: [] })

    expect(audit.selectedHosts).toEqual([])
    expect(audit.results).toEqual([])
  })
})
