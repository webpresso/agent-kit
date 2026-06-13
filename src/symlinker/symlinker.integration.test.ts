import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readlinkSync,
  rmSync,
  statSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  ALLOWED_REAL_FILES,
  type ConsumerConfig,
  DEFAULT_PER_SKILL_CONSUMERS,
  DEFAULT_SKILLS_CONSUMERS,
  type PerSkillConsumerConfig,
  type SkillsConsumerConfig,
  createMissingSymlinks,
  fixExistingFile,
  getAgentSources,
  importAgentFile,
  isAgentOrConsumerFile,
  syncAgentsMd,
  syncAll,
  syncConsumer,
  syncMcpJson,
  syncSkillFanout,
  syncSkillFanouts,
  syncSkills,
  syncSkillsConsumer,
} from './index.js'
import { assertSymlinkResolves } from './test-utils/assert-symlink-resolves.js'

function makeTempDir(): string {
  // mkdtempSync creates an OS-guaranteed-unique directory atomically — no
  // Date.now()/Math.random() collision window under parallel test files.
  return mkdtempSync(join(tmpdir(), 'workflow-symlinks-test-'))
}

function writeFile(path: string, content = '# placeholder'): void {
  mkdirSync(join(path, '..'), { recursive: true })
  writeFileSync(path, content)
}

function _makeSymlink(linkPath: string, target: string): void {
  mkdirSync(join(linkPath, '..'), { recursive: true })
  symlinkSync(target, linkPath)
}

function isSymlink(filePath: string): boolean {
  try {
    return lstatSync(filePath).isSymbolicLink()
  } catch {
    return false
  }
}

function readTarget(path: string): string {
  return readlinkSync(path)
}

const CONSUMER: ConsumerConfig = {
  dir: '.test-consumer/commands',
  sourcePrefix: '../../.agent/',
}

describe('symlinker', () => {
  let root: string

  beforeEach(() => {
    root = makeTempDir()
  })

  afterEach(() => {
    rmSync(root, { recursive: true, force: true })
  })

  describe('getAgentSources', () => {
    it('returns empty map when .agent/ does not exist', () => {
      const sources = getAgentSources(root)
      expect(sources.size).toBe(0)
    })

    it('collects .md files from commands and workflows', () => {
      writeFile(join(root, '.agent/commands/audit.md'))
      writeFile(join(root, '.agent/commands/tph.md'))
      writeFile(join(root, '.agent/workflows/debug.md'))

      const sources = getAgentSources(root)
      expect(sources.size).toBe(3)
      expect(sources.get('audit.md')).toBe('commands/audit.md')
      expect(sources.get('tph.md')).toBe('commands/tph.md')
      expect(sources.get('debug.md')).toBe('workflows/debug.md')
    })

    it('ignores non-.md files', () => {
      writeFile(join(root, '.agent/commands/audit.md'))
      writeFile(join(root, '.agent/commands/config.json'))
      writeFile(join(root, '.agent/commands/.gitkeep'))

      const sources = getAgentSources(root)
      expect(sources.size).toBe(1)
      expect(sources.has('config.json')).toBe(false)
    })

    it('handles only commands dir existing', () => {
      writeFile(join(root, '.agent/commands/verify.md'))

      const sources = getAgentSources(root)
      expect(sources.size).toBe(1)
      expect(sources.get('verify.md')).toBe('commands/verify.md')
    })

    it('handles only workflows dir existing', () => {
      writeFile(join(root, '.agent/workflows/debug.md'))

      const sources = getAgentSources(root)
      expect(sources.size).toBe(1)
      expect(sources.get('debug.md')).toBe('workflows/debug.md')
    })
  })

  describe('fixExistingFile', () => {
    const agentSources = new Map([['verify.md', 'commands/verify.md']])

    it('replaces a real file with a symlink when agent source exists', () => {
      const consumerDir = join(root, CONSUMER.dir)
      mkdirSync(consumerDir, { recursive: true })
      writeFileSync(join(consumerDir, 'verify.md'), '# real file content')

      const result = fixExistingFile(root, CONSUMER, 'verify.md', agentSources)

      expect(result).toBe(true)
      const linkPath = join(consumerDir, 'verify.md')
      expect(isSymlink(linkPath)).toBe(true)
      expect(readTarget(linkPath)).toBe('../../.agent/commands/verify.md')
    })

    it('skips real file with no agent source', () => {
      const consumerDir = join(root, CONSUMER.dir)
      mkdirSync(consumerDir, { recursive: true })
      writeFileSync(join(consumerDir, 'orphan.md'), '# orphan')

      const result = fixExistingFile(root, CONSUMER, 'orphan.md', agentSources)

      expect(result).toBe(false)
      expect(isSymlink(join(consumerDir, 'orphan.md'))).toBe(false)
    })

    it('leaves valid symlink untouched', () => {
      const consumerDir = join(root, CONSUMER.dir)
      mkdirSync(join(root, '.agent/commands'), { recursive: true })
      writeFileSync(join(root, '.agent/commands/verify.md'), '# source')
      mkdirSync(consumerDir, { recursive: true })
      symlinkSync('../../.agent/commands/verify.md', join(consumerDir, 'verify.md'))

      const result = fixExistingFile(root, CONSUMER, 'verify.md', agentSources)

      expect(result).toBe(false)
    })

    it('fixes broken symlink when agent source exists', () => {
      const consumerDir = join(root, CONSUMER.dir)
      mkdirSync(consumerDir, { recursive: true })
      symlinkSync('../../.agent/commands/nonexistent.md', join(consumerDir, 'verify.md'))

      const result = fixExistingFile(root, CONSUMER, 'verify.md', agentSources)

      expect(result).toBe(true)
      const linkPath = join(consumerDir, 'verify.md')
      expect(isSymlink(linkPath)).toBe(true)
      expect(readTarget(linkPath)).toBe('../../.agent/commands/verify.md')
    })

    it('removes broken symlink with no agent source', () => {
      const consumerDir = join(root, CONSUMER.dir)
      mkdirSync(consumerDir, { recursive: true })
      symlinkSync('../../.agent/commands/gone.md', join(consumerDir, 'gone.md'))

      const result = fixExistingFile(root, CONSUMER, 'gone.md', agentSources)

      expect(result).toBe(true)
      expect(isSymlink(join(consumerDir, 'gone.md'))).toBe(false)
    })

    it('fixes symlink pointing outside .agent/', () => {
      const consumerDir = join(root, CONSUMER.dir)
      mkdirSync(consumerDir, { recursive: true })
      const outsideTarget = join(root, 'somewhere/verify.md')
      writeFile(outsideTarget)
      symlinkSync('../../somewhere/verify.md', join(consumerDir, 'verify.md'))

      const result = fixExistingFile(root, CONSUMER, 'verify.md', agentSources)

      expect(result).toBe(true)
      expect(readTarget(join(consumerDir, 'verify.md'))).toBe('../../.agent/commands/verify.md')
    })

    it('fixes symlink pointing to wrong .agent/ file (name drift)', () => {
      const consumerDir = join(root, CONSUMER.dir)
      mkdirSync(join(root, '.agent/commands'), { recursive: true })
      writeFileSync(join(root, '.agent/commands/verify.md'), '# verify source')
      writeFileSync(join(root, '.agent/commands/audit.md'), '# audit source')
      mkdirSync(consumerDir, { recursive: true })
      // verify.md symlinked to the WRONG .agent/ file (audit.md)
      symlinkSync('../../.agent/commands/audit.md', join(consumerDir, 'verify.md'))

      const result = fixExistingFile(root, CONSUMER, 'verify.md', agentSources)

      expect(result).toBe(true)
      expect(readTarget(join(consumerDir, 'verify.md'))).toBe('../../.agent/commands/verify.md')
    })

    it('leaves symlink with no agent source + valid .agent/ target untouched', () => {
      // Orphan consumer file pointing to a real .agent/ file that exists but
      // has no matching source in agentSources (stale cleanup is syncConsumer's
      // job, not fixExistingFile's when the target is still valid).
      const consumerDir = join(root, CONSUMER.dir)
      mkdirSync(join(root, '.agent/commands'), { recursive: true })
      writeFileSync(join(root, '.agent/commands/orphan.md'), '# orphan')
      mkdirSync(consumerDir, { recursive: true })
      symlinkSync('../../.agent/commands/orphan.md', join(consumerDir, 'orphan.md'))

      const result = fixExistingFile(root, CONSUMER, 'orphan.md', agentSources)

      expect(result).toBe(false)
    })
  })

  describe('createMissingSymlinks', () => {
    it('creates symlinks for all missing agent sources', () => {
      const consumerDir = join(root, CONSUMER.dir)
      mkdirSync(consumerDir, { recursive: true })

      const agentSources = new Map([
        ['audit.md', 'commands/audit.md'],
        ['tph.md', 'commands/tph.md'],
      ])

      const count = createMissingSymlinks(root, CONSUMER, new Set<string>(), agentSources)

      expect(count).toBe(2)
      expect(isSymlink(join(consumerDir, 'audit.md'))).toBe(true)
      expect(isSymlink(join(consumerDir, 'tph.md'))).toBe(true)
      expect(readTarget(join(consumerDir, 'audit.md'))).toBe('../../.agent/commands/audit.md')
    })

    it('skips files that already exist in consumer', () => {
      const consumerDir = join(root, CONSUMER.dir)
      mkdirSync(consumerDir, { recursive: true })

      const agentSources = new Map([
        ['audit.md', 'commands/audit.md'],
        ['tph.md', 'commands/tph.md'],
      ])
      const existing = new Set(['audit.md'])

      const count = createMissingSymlinks(root, CONSUMER, existing, agentSources)

      expect(count).toBe(1)
      expect(isSymlink(join(consumerDir, 'tph.md'))).toBe(true)
      expect(existsSync(join(consumerDir, 'audit.md'))).toBe(false)
    })

    it('skips ALLOWED_REAL_FILES', () => {
      const consumerDir = join(root, CONSUMER.dir)
      mkdirSync(consumerDir, { recursive: true })

      const agentSources = new Map([
        ['README.md', 'commands/README.md'],
        ['audit.md', 'commands/audit.md'],
      ])

      const count = createMissingSymlinks(root, CONSUMER, new Set<string>(), agentSources)

      expect(count).toBe(1)
      expect(existsSync(join(consumerDir, 'README.md'))).toBe(false)
    })
  })

  describe('syncConsumer', () => {
    it('creates consumer dir if it does not exist', () => {
      writeFile(join(root, '.agent/commands/audit.md'))
      const agentSources = new Map([['audit.md', 'commands/audit.md']])

      syncConsumer(root, CONSUMER, agentSources)

      expect(existsSync(join(root, CONSUMER.dir))).toBe(true)
      expect(isSymlink(join(root, CONSUMER.dir, 'audit.md'))).toBe(true)
    })

    it('fixes real files and creates missing symlinks in one pass', () => {
      writeFile(join(root, '.agent/commands/audit.md'))
      writeFile(join(root, '.agent/commands/tph.md'))
      const consumerDir = join(root, CONSUMER.dir)
      mkdirSync(consumerDir, { recursive: true })
      writeFileSync(join(consumerDir, 'audit.md'), '# real file')

      const agentSources = new Map([
        ['audit.md', 'commands/audit.md'],
        ['tph.md', 'commands/tph.md'],
      ])

      const fixCount = syncConsumer(root, CONSUMER, agentSources)

      expect(fixCount).toBe(2)
      expect(isSymlink(join(consumerDir, 'audit.md'))).toBe(true)
      expect(isSymlink(join(consumerDir, 'tph.md'))).toBe(true)
    })

    it('returns 0 when everything is already correct', () => {
      writeFile(join(root, '.agent/commands/audit.md'))
      const consumerDir = join(root, CONSUMER.dir)
      mkdirSync(consumerDir, { recursive: true })
      symlinkSync('../../.agent/commands/audit.md', join(consumerDir, 'audit.md'))

      const agentSources = new Map([['audit.md', 'commands/audit.md']])

      const fixCount = syncConsumer(root, CONSUMER, agentSources)

      expect(fixCount).toBe(0)
    })

    it('skips non-.md files in consumer dir', () => {
      const consumerDir = join(root, CONSUMER.dir)
      mkdirSync(consumerDir, { recursive: true })
      writeFileSync(join(consumerDir, 'config.json'), '{}')

      const agentSources = new Map<string, string>()

      const fixCount = syncConsumer(root, CONSUMER, agentSources)

      expect(fixCount).toBe(0)
      expect(existsSync(join(consumerDir, 'config.json'))).toBe(true)
    })

    it('skips ALLOWED_REAL_FILES even if they are real files', () => {
      const consumerDir = join(root, CONSUMER.dir)
      mkdirSync(consumerDir, { recursive: true })
      writeFileSync(join(consumerDir, 'README.md'), '# readme')

      const agentSources = new Map<string, string>()

      const fixCount = syncConsumer(root, CONSUMER, agentSources)

      expect(fixCount).toBe(0)
      expect(isSymlink(join(consumerDir, 'README.md'))).toBe(false)
    })
  })

  describe('syncAll', () => {
    it('syncs multiple consumers', () => {
      writeFile(join(root, '.agent/commands/audit.md'))

      const consumers: ConsumerConfig[] = [
        { dir: '.consumer-a/commands', sourcePrefix: '../../.agent/' },
        { dir: '.consumer-b/commands', sourcePrefix: '../../.agent/' },
      ]

      const totalFixes = syncAll(root, consumers)

      // 2 symlinks
      expect(totalFixes).toBe(2)
      expect(isSymlink(join(root, '.consumer-a/commands/audit.md'))).toBe(true)
      expect(isSymlink(join(root, '.consumer-b/commands/audit.md'))).toBe(true)
    })

    it('returns 0 when all consumers are already synced', () => {
      writeFile(join(root, '.agent/commands/audit.md'))

      const consumers: ConsumerConfig[] = [
        { dir: '.consumer-a/commands', sourcePrefix: '../../.agent/' },
      ]
      mkdirSync(join(root, '.consumer-a/commands'), { recursive: true })
      symlinkSync('../../.agent/commands/audit.md', join(root, '.consumer-a/commands/audit.md'))

      // Pre-synced symlink → no fixes
      const firstRun = syncAll(root, consumers)
      expect(firstRun).toBe(0)

      const secondRun = syncAll(root, consumers)
      expect(secondRun).toBe(0)
    })

    it('is idempotent — second run returns 0', () => {
      writeFile(join(root, '.agent/commands/audit.md'))
      writeFile(join(root, '.agent/commands/soa.md'))

      const consumers: ConsumerConfig[] = [
        { dir: '.consumer/commands', sourcePrefix: '../../.agent/' },
      ]

      const firstRun = syncAll(root, consumers)
      // 2 symlinks
      expect(firstRun).toBe(2)

      const secondRun = syncAll(root, consumers)
      expect(secondRun).toBe(0)
    })

    it('handles mixed scenarios: real files, broken symlinks, missing, valid', () => {
      writeFile(join(root, '.agent/commands/audit.md'))
      writeFile(join(root, '.agent/commands/tph.md'))
      writeFile(join(root, '.agent/commands/verify.md'))
      writeFile(join(root, '.agent/commands/soa.md'))

      const consumerDir = join(root, '.consumer/commands')
      mkdirSync(consumerDir, { recursive: true })

      writeFileSync(join(consumerDir, 'audit.md'), '# real file')
      symlinkSync('../../.agent/commands/nonexistent.md', join(consumerDir, 'tph.md'))
      symlinkSync('../../.agent/commands/verify.md', join(consumerDir, 'verify.md'))

      const consumers: ConsumerConfig[] = [
        { dir: '.consumer/commands', sourcePrefix: '../../.agent/' },
      ]

      const totalFixes = syncAll(root, consumers)

      // 3 symlink fixes
      expect(totalFixes).toBe(3)
      expect(isSymlink(join(consumerDir, 'audit.md'))).toBe(true)
      expect(readTarget(join(consumerDir, 'audit.md'))).toBe('../../.agent/commands/audit.md')
      expect(isSymlink(join(consumerDir, 'tph.md'))).toBe(true)
      expect(readTarget(join(consumerDir, 'tph.md'))).toBe('../../.agent/commands/tph.md')
      expect(isSymlink(join(consumerDir, 'verify.md'))).toBe(true)
      expect(isSymlink(join(consumerDir, 'soa.md'))).toBe(true)
      expect(readTarget(join(consumerDir, 'soa.md'))).toBe('../../.agent/commands/soa.md')
    })

    it('handles empty .agent/ directories gracefully', () => {
      mkdirSync(join(root, '.agent/commands'), { recursive: true })
      mkdirSync(join(root, '.agent/workflows'), { recursive: true })

      const consumers: ConsumerConfig[] = [
        { dir: '.consumer/commands', sourcePrefix: '../../.agent/' },
      ]

      const totalFixes = syncAll(root, consumers)

      expect(totalFixes).toBe(0)
    })

    it('removes stale mirrored command files when the .agent source is deleted', () => {
      writeFile(join(root, '.agent/commands/plan-write.md'))
      writeFile(join(root, '.agent/commands/plan-refine.md'))
      writeFile(join(root, '.agent/commands/verify.md'))

      const consumers: ConsumerConfig[] = [
        { dir: '.consumer-a/commands', sourcePrefix: '../../.agent/' },
        { dir: '.consumer-b/commands', sourcePrefix: '../../.agent/' },
      ]

      expect(syncAll(root, consumers)).toBeGreaterThan(0)
      expect(existsSync(join(root, '.consumer-a/commands/plan-write.md'))).toBe(true)
      expect(existsSync(join(root, '.consumer-a/commands/plan-refine.md'))).toBe(true)
      expect(existsSync(join(root, '.consumer-b/commands/plan-write.md'))).toBe(true)
      expect(existsSync(join(root, '.consumer-b/commands/plan-refine.md'))).toBe(true)

      rmSync(join(root, '.agent/commands/plan-write.md'), { force: true })
      rmSync(join(root, '.agent/commands/plan-refine.md'), { force: true })

      const fixCount = syncAll(root, consumers)
      expect(fixCount).toBeGreaterThan(0)
      expect(existsSync(join(root, '.consumer-a/commands/plan-write.md'))).toBe(false)
      expect(existsSync(join(root, '.consumer-a/commands/plan-refine.md'))).toBe(false)
      expect(existsSync(join(root, '.consumer-b/commands/plan-write.md'))).toBe(false)
      expect(existsSync(join(root, '.consumer-b/commands/plan-refine.md'))).toBe(false)
      expect(existsSync(join(root, '.consumer-a/commands/verify.md'))).toBe(true)
      expect(existsSync(join(root, '.consumer-b/commands/verify.md'))).toBe(true)
    })

    it('symlinker claude — syncAll does NOT write to .claude/, .cursor/, .windsurf/, .opencode/', () => {
      // Verification gate: no primary-IDE writes after slimming.
      writeFile(join(root, '.agent/commands/audit.md'))
      writeFile(join(root, '.agent/skills/pll'), '# pll')

      syncAll(root)

      expect(existsSync(join(root, '.claude'))).toBe(false)
      expect(existsSync(join(root, '.cursor'))).toBe(false)
      expect(existsSync(join(root, '.windsurf'))).toBe(false)
      expect(existsSync(join(root, '.opencode'))).toBe(false)
    })
  })

  describe('syncSkillsConsumer', () => {
    const SKILLS_CONFIG: SkillsConsumerConfig = {
      linkPath: '.test-consumer/skills',
      target: '../.agent/skills',
    }

    it('creates directory symlink when .agent/skills exists', () => {
      mkdirSync(join(root, '.agent/skills/debugging'), { recursive: true })

      const fixCount = syncSkillsConsumer(root, SKILLS_CONFIG)

      expect(fixCount).toBe(1)
      const linkPath = join(root, SKILLS_CONFIG.linkPath)
      expect(isSymlink(linkPath)).toBe(true)
      expect(readTarget(linkPath)).toBe(SKILLS_CONFIG.target)
    })

    it('is idempotent — second run returns 0', () => {
      mkdirSync(join(root, '.agent/skills/debugging'), { recursive: true })

      expect(syncSkillsConsumer(root, SKILLS_CONFIG)).toBe(1)
      expect(syncSkillsConsumer(root, SKILLS_CONFIG)).toBe(0)
    })

    it('fixes broken symlink', () => {
      mkdirSync(join(root, '.agent/skills/debugging'), { recursive: true })
      mkdirSync(join(root, '.test-consumer'), { recursive: true })
      symlinkSync('../nonexistent', join(root, SKILLS_CONFIG.linkPath))

      const fixCount = syncSkillsConsumer(root, SKILLS_CONFIG)

      expect(fixCount).toBe(1)
      expect(readTarget(join(root, SKILLS_CONFIG.linkPath))).toBe(SKILLS_CONFIG.target)
    })

    it('fixes symlink with wrong target', () => {
      mkdirSync(join(root, '.agent/skills/debugging'), { recursive: true })
      mkdirSync(join(root, 'elsewhere'), { recursive: true })
      mkdirSync(join(root, '.test-consumer'), { recursive: true })
      symlinkSync('../elsewhere', join(root, SKILLS_CONFIG.linkPath))

      const fixCount = syncSkillsConsumer(root, SKILLS_CONFIG)

      expect(fixCount).toBe(1)
      expect(readTarget(join(root, SKILLS_CONFIG.linkPath))).toBe(SKILLS_CONFIG.target)
    })

    it('skips real directory with warning', () => {
      mkdirSync(join(root, '.agent/skills/debugging'), { recursive: true })
      mkdirSync(join(root, SKILLS_CONFIG.linkPath), { recursive: true })

      const fixCount = syncSkillsConsumer(root, SKILLS_CONFIG)

      expect(fixCount).toBe(0)
      expect(isSymlink(join(root, SKILLS_CONFIG.linkPath))).toBe(false)
    })
  })

  describe('syncSkills', () => {
    it('syncs all consumers when .agent/skills exists', () => {
      mkdirSync(join(root, '.agent/skills/debugging'), { recursive: true })

      const consumers: SkillsConsumerConfig[] = [
        { linkPath: '.consumer-a/skills', target: '../.agent/skills' },
        { linkPath: '.consumer-b/skills', target: '../.agent/skills' },
      ]

      const fixCount = syncSkills(root, consumers)

      expect(fixCount).toBe(2)
      expect(isSymlink(join(root, '.consumer-a/skills'))).toBe(true)
      expect(isSymlink(join(root, '.consumer-b/skills'))).toBe(true)
    })

    it('returns 0 when .agent/skills does not exist', () => {
      expect(syncSkills(root)).toBe(0)
    })

    it('is idempotent — second run returns 0', () => {
      mkdirSync(join(root, '.agent/skills/debugging'), { recursive: true })

      const consumers: SkillsConsumerConfig[] = [
        { linkPath: '.consumer/skills', target: '../.agent/skills' },
      ]

      expect(syncSkills(root, consumers)).toBe(1)
      expect(syncSkills(root, consumers)).toBe(0)
    })

    it('DEFAULT_SKILLS_CONSUMERS is empty — primary IDEs use native channels', () => {
      expect(DEFAULT_SKILLS_CONSUMERS).toEqual([])
    })
  })

  describe('syncSkillFanout', () => {
    const CONFIG: PerSkillConsumerConfig = {
      dir: '.test-codex/skills',
    }

    it('creates directory symlinks for each .agent/skills/* directory', () => {
      writeFile(join(root, '.agent/skills/pll/SKILL.md'), '# pll')
      writeFile(join(root, '.agent/skills/verify/SKILL.md'), '# verify')

      const result = syncSkillFanout(root, CONFIG)

      expect(result.wrote).toBe(2)
      expect(statSync(join(root, '.test-codex/skills/pll')).isDirectory()).toBe(true)
      expect(lstatSync(join(root, '.test-codex/skills/pll')).isSymbolicLink()).toBe(true)
      expect(statSync(join(root, '.test-codex/skills/verify')).isDirectory()).toBe(true)
      expect(lstatSync(join(root, '.test-codex/skills/verify')).isSymbolicLink()).toBe(true)
      // Skill dirs are symlinked and SKILL.md resolves to real files.
      assertSymlinkResolves(join(root, '.test-codex/skills/pll/SKILL.md'))
      assertSymlinkResolves(join(root, '.test-codex/skills/verify/SKILL.md'))
    })

    it('walks the source skill dir recursively for nested asset files (codex #7)', () => {
      writeFile(join(root, '.agent/skills/tanstack/SKILL.md'), '# tanstack')
      writeFile(join(root, '.agent/skills/tanstack/references/factory.ts'), 'export {}')
      writeFile(join(root, '.agent/skills/tanstack/templates/route.ts'), 'export {}')

      const result = syncSkillFanout(root, CONFIG)

      expect(result.wrote).toBe(1)
      assertSymlinkResolves(join(root, '.test-codex/skills/tanstack/SKILL.md'))
      assertSymlinkResolves(join(root, '.test-codex/skills/tanstack/references/factory.ts'))
      assertSymlinkResolves(join(root, '.test-codex/skills/tanstack/templates/route.ts'))
    })

    it('replaces old file-level projections inside an expected slug', () => {
      writeFile(join(root, '.agent/skills/pll/SKILL.md'), '# pll')
      mkdirSync(join(root, '.test-codex/skills/pll'), { recursive: true })
      writeFile(join(root, '.test-codex/skills/pll/USER_NOTES.md'), '# user owns this')

      syncSkillFanout(root, CONFIG)

      expect(lstatSync(join(root, '.test-codex/skills/pll')).isSymbolicLink()).toBe(true)
      expect(existsSync(join(root, '.test-codex/skills/pll/USER_NOTES.md'))).toBe(false)
      assertSymlinkResolves(join(root, '.test-codex/skills/pll/SKILL.md'))
    })

    it('top-level prune is aggressive: removes unexpected slug dirs recursively (D2 contract)', () => {
      writeFile(join(root, '.agent/skills/pll/SKILL.md'), '# pll')
      // User-curated third-party slug — under D2, this IS removed.
      mkdirSync(join(root, '.test-codex/skills/my-custom'), { recursive: true })
      writeFile(join(root, '.test-codex/skills/my-custom/SKILL.md'), '# user-curated')

      syncSkillFanout(root, CONFIG)

      expect(existsSync(join(root, '.test-codex/skills/my-custom'))).toBe(false)
    })

    it('prints stderr line per top-level removal (DX1 visibility hook)', () => {
      writeFile(join(root, '.agent/skills/pll/SKILL.md'), '# pll')
      mkdirSync(join(root, '.test-codex/skills/orphan'), { recursive: true })
      writeFile(join(root, '.test-codex/skills/orphan/SKILL.md'), '# orphan')

      const errors: string[] = []
      const origError = console.error
      console.error = (msg: unknown): void => {
        errors.push(String(msg))
      }
      try {
        syncSkillFanout(root, CONFIG)
      } finally {
        console.error = origError
      }

      expect(
        errors.some(
          (line) => line.includes('Removed unexpected directory') && line.includes('orphan'),
        ),
      ).toBe(true)
    })

    it('is idempotent — second run wrote=0', () => {
      writeFile(join(root, '.agent/skills/pll/SKILL.md'), '# pll')

      expect(syncSkillFanout(root, CONFIG).wrote).toBeGreaterThan(0)
      expect(syncSkillFanout(root, CONFIG).wrote).toBe(0)
    })

    it('keeps an existing correct directory symlink', () => {
      writeFile(join(root, '.agent/skills/pll/SKILL.md'), '# pll')
      mkdirSync(join(root, '.test-codex/skills'), { recursive: true })
      symlinkSync('../../.agent/skills/pll', join(root, '.test-codex/skills/pll'))

      const result = syncSkillFanout(root, CONFIG)

      expect(result.wrote).toBe(0)
      expect(statSync(join(root, '.test-codex/skills/pll')).isDirectory()).toBe(true)
      expect(lstatSync(join(root, '.test-codex/skills/pll')).isSymbolicLink()).toBe(true)
      assertSymlinkResolves(join(root, '.test-codex/skills/pll/SKILL.md'))
    })

    it('returns wrote=0 when .agent/skills does not exist', () => {
      expect(syncSkillFanout(root, CONFIG).wrote).toBe(0)
    })
  })

  describe('syncSkillFanouts', () => {
    it('DEFAULT_PER_SKILL_CONSUMERS targets the convergent .agents/skills path', () => {
      // `.agents/skills/` covers Codex (official), Amp (official), and
      // OpenCode (fallback) in a single per-skill entry. Post-D1, source
      // resolution is `.agent/skills/<slug>/` only — sourceRootDir was
      // dropped because it produced an asymmetric fallback that allowed
      // dangling symlinks (the bc88 failure class).
      expect(DEFAULT_PER_SKILL_CONSUMERS).toEqual([{ dir: '.agents/skills' }])
    })

    it('fans out to all consumers', () => {
      writeFile(join(root, '.agent/skills/pll/SKILL.md'), '# pll')

      const consumers: PerSkillConsumerConfig[] = [
        { dir: '.consumer-a/skills' },
        { dir: '.consumer-b/skills' },
      ]

      const result = syncSkillFanouts(root, consumers)

      // 1 SKILL.md symlink in each consumer = 2 fixes
      expect(result.wrote).toBe(2)
      expect(statSync(join(root, '.consumer-a/skills/pll')).isDirectory()).toBe(true)
      assertSymlinkResolves(join(root, '.consumer-a/skills/pll/SKILL.md'))
      assertSymlinkResolves(join(root, '.consumer-b/skills/pll/SKILL.md'))
    })

    it('returns wrote=0 when .agent/skills does not exist', () => {
      expect(syncSkillFanouts(root).wrote).toBe(0)
    })
  })

  describe('isAgentOrConsumerFile (pre-commit trigger)', () => {
    const shouldMatch = [
      '.agent/commands/audit.md',
      '.agent/commands/tph.md',
      '.agent/workflows/debug.md',
      '.agent/workflows/conf.md',
      '.agent/skills/debugging/SKILL.md',
      '.agents/skills/pll/SKILL.md',
      '.agents/skills/verify/SKILL.md',
    ]

    const shouldNotMatch = [
      '.agent/commands/config.json',
      '.agent/index.md',
      '.agent/guides/README.md',
      '.github/workflows/ci.yml',
      'apps/scripts/src/symlinker.ts',
      '.claude/settings.json',
      '.windsurf/rules/quality-logs.md',
      'README.md',
      '.gemini/commands/config.json',
      '.gemini/settings.toml',
      // Primary IDEs removed from symlinker — handled by native channels.
      '.claude/commands/audit.md',
      '.claude/commands/verify.md',
      '.cursor/commands/audit.md',
      '.windsurf/commands/soa.md',
      '.windsurf/commands/brainstorm.md',
      '.claude/skills/debugging/SKILL.md',
      '.opencode/commands/verify.md',
      '.opencode/commands/pll.md',
      // Deliberately unmapped — see consumers.ts for rationale.
      '.codex/prompts/verify.md',
      '.codex/skills/pll/SKILL.md',
      '.opencode/skills/pll/SKILL.md',
    ]

    it.each(shouldMatch)('matches %s', (file) => {
      expect(isAgentOrConsumerFile(file)).toBe(true)
    })

    it.each(shouldNotMatch)('does not match %s', (file) => {
      expect(isAgentOrConsumerFile(file)).toBe(false)
    })
  })

  describe('ALLOWED_REAL_FILES', () => {
    it('includes README.md', () => {
      expect(ALLOWED_REAL_FILES.has('README.md')).toBe(true)
    })

    it('includes .markdownlint.json', () => {
      expect(ALLOWED_REAL_FILES.has('.markdownlint.json')).toBe(true)
    })

    it('does not include arbitrary files', () => {
      expect(ALLOWED_REAL_FILES.has('audit.md')).toBe(false)
    })
  })

  describe('syncAgentsMd', () => {
    it('returns 0 when .agent/AGENTS.md does not exist', () => {
      const count = syncAgentsMd(root)
      expect(count).toBe(0)
      expect(existsSync(join(root, 'AGENTS.md'))).toBe(false)
    })

    it('writes AGENTS.md at repo root from .agent/AGENTS.md', () => {
      const content = '# AGENTS\n\nThis is the canonical agents file.'
      mkdirSync(join(root, '.agent'), { recursive: true })
      writeFileSync(join(root, '.agent', 'AGENTS.md'), content)

      const count = syncAgentsMd(root)

      expect(count).toBe(1)
      expect(existsSync(join(root, 'AGENTS.md'))).toBe(true)
      expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toBe(content)
    })

    it('returns 0 (idempotent) when AGENTS.md already matches', () => {
      const content = '# AGENTS\n\nalready in sync'
      mkdirSync(join(root, '.agent'), { recursive: true })
      writeFileSync(join(root, '.agent', 'AGENTS.md'), content)
      writeFileSync(join(root, 'AGENTS.md'), content)

      const count = syncAgentsMd(root)

      expect(count).toBe(0)
      expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toBe(content)
    })

    it('overwrites repo-root AGENTS.md when content differs', () => {
      mkdirSync(join(root, '.agent'), { recursive: true })
      writeFileSync(join(root, '.agent', 'AGENTS.md'), '# Updated content')
      writeFileSync(join(root, 'AGENTS.md'), '# Old content')

      const count = syncAgentsMd(root)

      expect(count).toBe(1)
      expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toBe('# Updated content')
    })
  })

  describe('syncMcpJson', () => {
    it('returns 0 when .agent/mcp.json does not exist', () => {
      const count = syncMcpJson(root)
      expect(count).toBe(0)
    })

    it('writes .mcp.json and .cursor/mcp.json from .agent/mcp.json', () => {
      const content = JSON.stringify({ mcpServers: { example: { command: 'node' } } }, null, 2)
      mkdirSync(join(root, '.agent'), { recursive: true })
      writeFileSync(join(root, '.agent', 'mcp.json'), content)

      const count = syncMcpJson(root)

      expect(count).toBe(2)
      expect(readFileSync(join(root, '.mcp.json'), 'utf8')).toBe(content)
      expect(readFileSync(join(root, '.cursor', 'mcp.json'), 'utf8')).toBe(content)
    })

    it('is idempotent — returns 0 when all targets already match', () => {
      const content = JSON.stringify({ mcpServers: {} }, null, 2)
      mkdirSync(join(root, '.agent'), { recursive: true })
      writeFileSync(join(root, '.agent', 'mcp.json'), content)
      writeFileSync(join(root, '.mcp.json'), content)
      mkdirSync(join(root, '.cursor'), { recursive: true })
      writeFileSync(join(root, '.cursor', 'mcp.json'), content)

      const count = syncMcpJson(root)

      expect(count).toBe(0)
    })
  })

  describe('importAgentFile', () => {
    it('returns null when source file does not exist', () => {
      const result = importAgentFile(root, '.cursorrules')
      expect(result).toBeNull()
    })

    it('returns null for unrecognised source paths', () => {
      writeFileSync(join(root, 'unknown.md'), '# unknown')
      const result = importAgentFile(root, 'unknown.md')
      expect(result).toBeNull()
    })

    it('imports .cursorrules into .agent/AGENTS.md', () => {
      const content = '# rules\n\nFollow these rules.'
      writeFileSync(join(root, '.cursorrules'), content)

      const result = importAgentFile(root, '.cursorrules')

      expect(result).not.toBeNull()
      expect(result?.source).toBe('.cursorrules')
      expect(result?.dest).toBe('.agent/AGENTS.md')
      expect(readFileSync(join(root, '.agent', 'AGENTS.md'), 'utf8')).toBe(content)
    })

    it('imports CLAUDE.md into .agent/AGENTS.md', () => {
      const content = '# CLAUDE\n\nThis is the claude instructions.'
      writeFileSync(join(root, 'CLAUDE.md'), content)

      const result = importAgentFile(root, 'CLAUDE.md')

      expect(result).not.toBeNull()
      expect(result?.source).toBe('CLAUDE.md')
      expect(result?.dest).toBe('.agent/AGENTS.md')
      expect(readFileSync(join(root, '.agent', 'AGENTS.md'), 'utf8')).toBe(content)
    })

    it('imports .github/copilot-instructions.md into .agent/AGENTS.md', () => {
      const content = '# Copilot\n\nThese are copilot instructions.'
      mkdirSync(join(root, '.github'), { recursive: true })
      writeFileSync(join(root, '.github', 'copilot-instructions.md'), content)

      const result = importAgentFile(root, '.github/copilot-instructions.md')

      expect(result).not.toBeNull()
      expect(result?.source).toBe('.github/copilot-instructions.md')
      expect(result?.dest).toBe('.agent/AGENTS.md')
      expect(readFileSync(join(root, '.agent', 'AGENTS.md'), 'utf8')).toBe(content)
    })

    it('strips leading ./ from the source path for matching', () => {
      const content = '# rules'
      writeFileSync(join(root, '.cursorrules'), content)

      const result = importAgentFile(root, './.cursorrules')

      expect(result).not.toBeNull()
      expect(result?.source).toBe('.cursorrules')
    })

    it('round-trips: import → syncAgentsMd produces byte-identical AGENTS.md', () => {
      const content = '# Source rules\n\nFollow these.'
      writeFileSync(join(root, '.cursorrules'), content)

      importAgentFile(root, '.cursorrules')
      const syncCount = syncAgentsMd(root)

      // First sync should write AGENTS.md at root
      expect(syncCount).toBe(1)
      expect(readFileSync(join(root, 'AGENTS.md'), 'utf8')).toBe(content)

      // Second sync is idempotent
      const syncCount2 = syncAgentsMd(root)
      expect(syncCount2).toBe(0)
    })
  })
})
