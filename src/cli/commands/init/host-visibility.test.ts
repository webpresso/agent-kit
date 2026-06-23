import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { SHARED_FAVORITE_SKILLS } from './scaffold-agent.js'
import {
  REQUIRED_CORE_CAPABILITIES,
  auditHostSkillVisibility,
  hostSkillRoots,
  parseAgentHosts,
  summarizeHostSetupSurfaceVisibility,
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
  let packageRoot: string
  let homeDir: string

  beforeEach(() => {
    repoRoot = makeTempDir()
    packageRoot = makeTempDir()
    homeDir = makeTempDir()
    mkdirSync(repoRoot, { recursive: true })
    mkdirSync(packageRoot, { recursive: true })
    mkdirSync(homeDir, { recursive: true })
  })

  afterEach(() => {
    rmSync(repoRoot, { recursive: true, force: true })
    rmSync(packageRoot, { recursive: true, force: true })
    rmSync(homeDir, { recursive: true, force: true })
  })

  it('treats the shared favorites as core required capabilities', () => {
    expect(REQUIRED_CORE_CAPABILITIES).toEqual(SHARED_FAVORITE_SKILLS)
    expect(REQUIRED_CORE_CAPABILITIES).toEqual(
      expect.arrayContaining([
        'fix',
        'verify',
        'testing-philosophy',
        'plan-refine',
        'pll',
        'best-practice-research',
      ]),
    )
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
      join(repoRoot, '.agent', 'skills'),
      join(repoRoot, '.claude', 'skills'),
      join(repoRoot, '.agents', 'skills'),
    ])

    writeSkill(join(repoRoot, '.opencode', 'skills'), 'verify')
    writeSkill(join(repoRoot, '.claude', 'skills'), 'plan-refine')

    const audit = auditHostSkillVisibility({ repoRoot, homeDir, hosts: ['opencode'] })
    const visibleAfterRestart = new Set(['verify', 'plan-refine'])
    expect(audit.results.map((r) => [r.capability, r.status])).toEqual(
      REQUIRED_CORE_CAPABILITIES.map((capability) => [
        capability,
        visibleAfterRestart.has(capability) ? 'visible-after-restart' : 'not-visible',
      ]),
    )
  })

  it('treats plugin hosts as visible via the canonical .agent/skills SSOT (plugin delivery)', () => {
    // No .claude/skills or .agents/skills projection (plugin is the channel),
    // but the skill is installed in the canonical repo agent surface.
    writeSkill(join(repoRoot, '.agent', 'skills'), 'verify')

    const audit = auditHostSkillVisibility({
      repoRoot,
      homeDir,
      hosts: ['claude', 'codex'],
      requiredCapabilities: ['verify'],
    })
    expect(audit.results.map((r) => [r.host, r.status])).toEqual([
      ['claude', 'visible-after-restart'],
      ['codex', 'visible-after-restart'],
    ])
  })

  it('treats a plugin host as visible when its installed plugin cache carries the skill', () => {
    // Simulate an installed Claude plugin (versioned cache dir) with no repo
    // skill dirs and no canonical .agent/skills.
    writeSkill(
      join(homeDir, '.claude', 'plugins', 'cache', 'webpresso', 'agent-kit', '9.9.9', 'skills'),
      'verify',
    )

    const audit = auditHostSkillVisibility({
      repoRoot,
      homeDir,
      hosts: ['claude'],
      requiredCapabilities: ['verify'],
    })
    expect(audit.results[0]?.status).toBe('visible-after-restart')
    expect(audit.results[0]?.foundPaths[0]).toContain(join('plugins', 'cache'))
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

  it('reports Codex packaged artifacts separately from active hook ownership', () => {
    mkdirSync(join(packageRoot, '.codex-plugin'), { recursive: true })
    mkdirSync(join(packageRoot, 'hooks'), { recursive: true })
    mkdirSync(join(repoRoot, '.codex'), { recursive: true })
    writeFileSync(join(packageRoot, '.codex-plugin', 'plugin.json'), '{}')
    writeFileSync(join(packageRoot, 'codex.mcp.json'), '{}')
    writeFileSync(join(packageRoot, 'hooks', 'hooks.json'), '{}')
    writeFileSync(join(repoRoot, '.codex', 'hooks.json'), '{}')

    const lines = summarizeHostSetupSurfaceVisibility({ repoRoot, packageRoot })
    const codex = lines.find((line) => line.includes('codex:'))
    expect(codex).toContain('artifact=installed')
    expect(codex).toContain('active=managed')
    expect(codex).toContain('hooks/hooks.json metadata')
    expect(codex).toContain('.codex/hooks.json')
  })

  it('surfaces generated hook ownership and OpenCode degraded bridge boundaries', () => {
    mkdirSync(join(repoRoot, '.claude'), { recursive: true })
    mkdirSync(join(repoRoot, '.opencode', 'plugins'), { recursive: true })
    writeFileSync(join(repoRoot, '.claude', 'settings.json'), '{}')
    writeFileSync(join(repoRoot, '.opencode', 'plugins', 'webpresso-hooks.js'), '')

    const lines = summarizeHostSetupSurfaceVisibility({ repoRoot, packageRoot })
    expect(lines.find((line) => line.includes('claude:'))).toContain(
      'active hooks setup-managed in .claude/settings.json',
    )
    const opencode = lines.find((line) => line.includes('opencode:'))
    expect(opencode).toContain('artifact=installed')
    expect(opencode).toContain('active=plugin-bridge')
    expect(opencode).toContain('support=degraded')
    expect(opencode).toContain('generated whole-file')
  })

  it('keeps deferred host setup surfaces visible without marking them required failures', () => {
    const lines = summarizeHostSetupSurfaceVisibility({ repoRoot, packageRoot })
    const cursor = lines.find((line) => line.includes('cursor:'))
    expect(cursor).toContain('artifact=deferred')
    expect(cursor).toContain('support=degraded')
    expect(cursor).toContain('required=no')
  })
})
