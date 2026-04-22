import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  ALLOWED_REAL_FILES,
  type ConsumerConfig,
  DEFAULT_SKILLS_CONSUMERS,
  type SkillsConsumerConfig,
  createMissingSymlinks,
  fixExistingFile,
  getAgentSources,
  isAgentOrConsumerFile,
  syncAll,
  syncConsumer,
  syncGeminiCommands,
  syncSkills,
  syncSkillsConsumer,
} from './index.js'

function makeTempDir(): string {
  const dir = join(
    tmpdir(),
    `workflow-symlinks-test-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
  )
  mkdirSync(dir, { recursive: true })
  return dir
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

      // 2 symlinks + 1 Gemini TOML
      expect(totalFixes).toBe(3)
      expect(isSymlink(join(root, '.consumer-a/commands/audit.md'))).toBe(true)
      expect(isSymlink(join(root, '.consumer-b/commands/audit.md'))).toBe(true)
      expect(existsSync(join(root, '.gemini/commands/audit.toml'))).toBe(true)
    })

    it('returns 0 when all consumers and Gemini TOML are already synced', () => {
      writeFile(join(root, '.agent/commands/audit.md'))

      const consumers: ConsumerConfig[] = [
        { dir: '.consumer-a/commands', sourcePrefix: '../../.agent/' },
      ]
      mkdirSync(join(root, '.consumer-a/commands'), { recursive: true })
      symlinkSync('../../.agent/commands/audit.md', join(root, '.consumer-a/commands/audit.md'))

      // First run generates TOML
      const firstRun = syncAll(root, consumers)
      expect(firstRun).toBe(1) // 0 symlinks + 1 TOML

      // Second run: everything synced
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
      // 2 symlinks + 2 Gemini TOML
      expect(firstRun).toBe(4)

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

      // 3 symlink fixes + 4 Gemini TOML files
      expect(totalFixes).toBe(7)
      expect(isSymlink(join(consumerDir, 'audit.md'))).toBe(true)
      expect(readTarget(join(consumerDir, 'audit.md'))).toBe('../../.agent/commands/audit.md')
      expect(isSymlink(join(consumerDir, 'tph.md'))).toBe(true)
      expect(readTarget(join(consumerDir, 'tph.md'))).toBe('../../.agent/commands/tph.md')
      expect(isSymlink(join(consumerDir, 'verify.md'))).toBe(true)
      expect(isSymlink(join(consumerDir, 'soa.md'))).toBe(true)
      expect(readTarget(join(consumerDir, 'soa.md'))).toBe('../../.agent/commands/soa.md')
      // Gemini TOML files generated
      expect(existsSync(join(root, '.gemini/commands/audit.toml'))).toBe(true)
      expect(existsSync(join(root, '.gemini/commands/soa.toml'))).toBe(true)
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
        { dir: '.claude/commands', sourcePrefix: '../../.agent/' },
        { dir: '.cursor/commands', sourcePrefix: '../../.agent/' },
        { dir: '.windsurf/commands', sourcePrefix: '../../.agent/' },
      ]

      expect(syncAll(root, consumers)).toBeGreaterThan(0)
      expect(existsSync(join(root, '.claude/commands/plan-write.md'))).toBe(true)
      expect(existsSync(join(root, '.claude/commands/plan-refine.md'))).toBe(true)
      expect(existsSync(join(root, '.cursor/commands/plan-write.md'))).toBe(true)
      expect(existsSync(join(root, '.cursor/commands/plan-refine.md'))).toBe(true)
      expect(existsSync(join(root, '.windsurf/commands/plan-write.md'))).toBe(true)
      expect(existsSync(join(root, '.windsurf/commands/plan-refine.md'))).toBe(true)
      expect(existsSync(join(root, '.gemini/commands/plan-write.toml'))).toBe(true)
      expect(existsSync(join(root, '.gemini/commands/plan-refine.toml'))).toBe(true)

      rmSync(join(root, '.agent/commands/plan-write.md'), { force: true })
      rmSync(join(root, '.agent/commands/plan-refine.md'), { force: true })

      const fixCount = syncAll(root, consumers)
      expect(fixCount).toBeGreaterThan(0)
      expect(existsSync(join(root, '.claude/commands/plan-write.md'))).toBe(false)
      expect(existsSync(join(root, '.claude/commands/plan-refine.md'))).toBe(false)
      expect(existsSync(join(root, '.cursor/commands/plan-write.md'))).toBe(false)
      expect(existsSync(join(root, '.cursor/commands/plan-refine.md'))).toBe(false)
      expect(existsSync(join(root, '.windsurf/commands/plan-write.md'))).toBe(false)
      expect(existsSync(join(root, '.windsurf/commands/plan-refine.md'))).toBe(false)
      expect(existsSync(join(root, '.claude/commands/verify.md'))).toBe(true)
      expect(existsSync(join(root, '.cursor/commands/verify.md'))).toBe(true)
      expect(existsSync(join(root, '.windsurf/commands/verify.md'))).toBe(true)
      expect(existsSync(join(root, '.gemini/commands/plan-write.toml'))).toBe(false)
      expect(existsSync(join(root, '.gemini/commands/plan-refine.toml'))).toBe(false)
      expect(existsSync(join(root, '.gemini/commands/verify.toml'))).toBe(true)
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

    it('DEFAULT_SKILLS_CONSUMERS targets Claude skills', () => {
      expect(DEFAULT_SKILLS_CONSUMERS).toEqual([
        { linkPath: '.claude/skills', target: '../.agent/skills' },
      ])
    })
  })

  describe('isAgentOrConsumerFile (pre-commit trigger)', () => {
    const shouldMatch = [
      '.agent/commands/audit.md',
      '.agent/commands/tph.md',
      '.agent/workflows/debug.md',
      '.agent/workflows/conf.md',
      '.agent/skills/debugging/SKILL.md',
      '.claude/commands/audit.md',
      '.claude/commands/verify.md',
      '.cursor/commands/audit.md',
      '.windsurf/commands/soa.md',
      '.windsurf/commands/brainstorm.md',
      '.claude/skills/debugging/SKILL.md',
      '.gemini/commands/verify.toml',
      '.gemini/commands/soa.toml',
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
      '.opencode/skills',
      '.gemini/commands/config.json',
      '.gemini/settings.toml',
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

  describe('syncGeminiCommands', () => {
    it('generates TOML files from commands and workflows', () => {
      writeFile(
        join(root, '.agent/commands/verify.md'),
        '---\ndescription: Quality gate\n---\n\n# Verify\n\nRun checks.',
      )
      writeFile(
        join(root, '.agent/workflows/debug.md'),
        '---\ndescription: Debug workflow\n---\n\n# Debug\n\nFind root cause.',
      )

      const fixCount = syncGeminiCommands(root)

      expect(fixCount).toBe(2)
      expect(existsSync(join(root, '.gemini/commands/verify.toml'))).toBe(true)
      expect(existsSync(join(root, '.gemini/commands/debug.toml'))).toBe(true)
    })

    it('converts $ARGUMENTS to {{args}}', () => {
      writeFile(
        join(root, '.agent/commands/audit.md'),
        '---\ndescription: Audit tool\n---\n\n# Audit\n\n**Arguments**: $ARGUMENTS',
      )

      syncGeminiCommands(root)

      const content = readFileSync(join(root, '.gemini/commands/audit.toml'), 'utf8')
      expect(content).toContain('{{args}}')
      expect(content).not.toContain('$ARGUMENTS')
    })

    it('extracts description from frontmatter', () => {
      writeFile(
        join(root, '.agent/commands/verify.md'),
        '---\ndescription: Quality gate check\n---\n\n# Verify',
      )

      syncGeminiCommands(root)

      const content = readFileSync(join(root, '.gemini/commands/verify.toml'), 'utf8')
      expect(content).toContain('description = "Quality gate check"')
    })

    it('commands override workflows with same name', () => {
      writeFile(
        join(root, '.agent/workflows/soa.md'),
        '---\ndescription: Workflow version\n---\n\n# SOA workflow',
      )
      writeFile(
        join(root, '.agent/commands/soa.md'),
        '---\ndescription: Command version\n---\n\n# SOA command',
      )

      syncGeminiCommands(root)

      const content = readFileSync(join(root, '.gemini/commands/soa.toml'), 'utf8')
      expect(content).toContain('description = "Command version"')
      expect(content).toContain('# SOA command')
    })

    it('is idempotent — second run returns 0', () => {
      writeFile(
        join(root, '.agent/commands/verify.md'),
        '---\ndescription: Quality gate\n---\n\n# Verify',
      )

      expect(syncGeminiCommands(root)).toBe(1)
      expect(syncGeminiCommands(root)).toBe(0)
    })

    it('removes stale TOML files with no source', () => {
      mkdirSync(join(root, '.gemini/commands'), { recursive: true })
      writeFileSync(join(root, '.gemini/commands/orphan.toml'), 'description = "stale"')

      const fixCount = syncGeminiCommands(root)

      expect(fixCount).toBe(1)
      expect(existsSync(join(root, '.gemini/commands/orphan.toml'))).toBe(false)
    })

    it('handles markdown without frontmatter', () => {
      writeFile(join(root, '.agent/commands/simple.md'), '# Simple command\n\nJust do it.')

      syncGeminiCommands(root)

      const content = readFileSync(join(root, '.gemini/commands/simple.toml'), 'utf8')
      expect(content).toContain('description = ""')
      expect(content).toContain('# Simple command')
    })

    it('returns 0 when no sources exist', () => {
      const fixCount = syncGeminiCommands(root)
      expect(fixCount).toBe(0)
    })
  })
})
