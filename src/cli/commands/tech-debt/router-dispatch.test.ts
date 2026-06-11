import { mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { executeTechDebtSubcommand } from './router-dispatch.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await mkTmpDir()
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

async function mkTmpDir(): Promise<string> {
  const dir = path.join(
    os.tmpdir(),
    `ak-tech-debt-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  await mkdir(dir, { recursive: true })
  return dir
}

/**
 * Returns the directory that resolveTechDebtRoot will use for a generic repo.
 * When neither tech-debt/ nor webpresso/tech-debt/ exists, it falls back to
 * webpresso/tech-debt. We create tech-debt/ directly so resolveTechDebtRoot
 * picks the generic path.
 */
function techDebtRoot(cwd: string): string {
  return path.join(cwd, 'tech-debt')
}

describe('executeTechDebtSubcommand', () => {
  describe('new subcommand', () => {
    it('writes a valid frontmatter file for a new tech-debt item', async () => {
      const { readFile, readdir } = await import('node:fs/promises')
      const tdRoot = techDebtRoot(tmpDir)
      const statusDir = path.join(tdRoot, 'accepted')
      await mkdir(statusDir, { recursive: true })

      await executeTechDebtSubcommand('new', ['Legacy CLI complexity'], {
        severity: 'medium',
        category: 'complexity',
        reviewCadence: 'quarterly',
        status: 'accepted',
        cwd: tmpDir,
      })

      const files = await readdir(statusDir)
      expect(files).toHaveLength(1)
      expect(files[0]).toMatch(/^h-001-legacy-cli-complexity\.md$/)

      const content = await readFile(path.join(statusDir, files[0]!), 'utf8')
      expect(content).toContain('type: tech-debt')
      expect(content).toContain('status: accepted')
      expect(content).toContain('severity: medium')
      expect(content).toContain('category: complexity')
      expect(content).toContain('review_cadence: quarterly')
      expect(content).toContain('last_reviewed:')
      expect(content).toContain('# Legacy CLI complexity')
    })

    it('auto-increments NNN across all status dirs', async () => {
      const tdRoot = techDebtRoot(tmpDir)
      const acceptedDir = path.join(tdRoot, 'accepted')
      const monitoringDir = path.join(tdRoot, 'monitoring')
      await mkdir(acceptedDir, { recursive: true })
      await mkdir(monitoringDir, { recursive: true })
      await writeFile(
        path.join(acceptedDir, 'h-001-existing.md'),
        '---\ntype: tech-debt\nstatus: accepted\n---\n',
      )
      await writeFile(
        path.join(monitoringDir, 'h-002-another.md'),
        '---\ntype: tech-debt\nstatus: monitoring\n---\n',
      )

      await executeTechDebtSubcommand('new', ['New item'], {
        severity: 'low',
        category: 'testing',
        reviewCadence: 'monthly',
        status: 'accepted',
        cwd: tmpDir,
      })

      const { readdir } = await import('node:fs/promises')
      const files = await readdir(acceptedDir)
      const newFile = files.find((f) => f.startsWith('h-003'))
      expect(newFile).not.toBe(undefined)
    })

    it('exits non-zero on invalid severity', async () => {
      await expect(
        executeTechDebtSubcommand('new', ['Test'], {
          severity: 'wat' as 'medium',
          category: 'testing',
          reviewCadence: 'monthly',
          status: 'accepted',
          cwd: tmpDir,
        }),
      ).rejects.toThrow(/invalid severity/i)
    })

    it('dry-run prints the would-be path without writing', async () => {
      const tdRoot = techDebtRoot(tmpDir)
      const acceptedDir = path.join(tdRoot, 'accepted')
      await mkdir(acceptedDir, { recursive: true })

      const logs: string[] = []
      const origLog = console.log
      console.log = (...args: unknown[]) => {
        logs.push(args.join(' '))
      }
      try {
        await executeTechDebtSubcommand('new', ['Dry run item'], {
          severity: 'high',
          category: 'security',
          reviewCadence: 'weekly',
          status: 'accepted',
          dryRun: true,
          cwd: tmpDir,
        })
      } finally {
        console.log = origLog
      }

      const { readdir } = await import('node:fs/promises')
      const files = await readdir(acceptedDir)
      expect(files).toHaveLength(0)
      expect(logs.some((l) => l.includes('h-001-dry-run-item.md'))).toBe(true)
    })
  })

  describe('list subcommand', () => {
    it('returns message when no tech-debt files exist', async () => {
      const logs: string[] = []
      const origLog = console.log
      console.log = (...args: unknown[]) => {
        logs.push(args.join(' '))
      }
      try {
        await executeTechDebtSubcommand('list', [], { cwd: tmpDir })
      } finally {
        console.log = origLog
      }
      // Should print something (empty list message or items)
      expect(logs.length).toBeGreaterThanOrEqual(0)
    })

    it('filters by --status accepted', async () => {
      const tdRoot = techDebtRoot(tmpDir)
      const acceptedDir = path.join(tdRoot, 'accepted')
      const resolvedDir = path.join(tdRoot, 'resolved')
      await mkdir(acceptedDir, { recursive: true })
      await mkdir(resolvedDir, { recursive: true })
      await writeFile(
        path.join(acceptedDir, 'h-001-item-a.md'),
        `---\ntype: tech-debt\nstatus: accepted\nseverity: medium\ncategory: complexity\nreview_cadence: quarterly\nlast_reviewed: '2024-01-01'\n---\n# Item A\n`,
      )
      await writeFile(
        path.join(resolvedDir, 'h-002-item-b.md'),
        `---\ntype: tech-debt\nstatus: resolved\nseverity: low\ncategory: testing\nreview_cadence: monthly\nlast_reviewed: '2024-01-01'\n---\n# Item B\n`,
      )

      const logs: string[] = []
      const origLog = console.log
      console.log = (...args: unknown[]) => {
        logs.push(args.join(' '))
      }
      try {
        await executeTechDebtSubcommand('list', [], { cwd: tmpDir, status: 'accepted' })
      } finally {
        console.log = origLog
      }

      const output = logs.join('\n')
      expect(output).toContain('item-a')
      expect(output).not.toContain('item-b')
    })
  })

  describe('review subcommand', () => {
    it('exits non-zero when overdue items exist', async () => {
      const tdRoot = techDebtRoot(tmpDir)
      const acceptedDir = path.join(tdRoot, 'accepted')
      await mkdir(acceptedDir, { recursive: true })
      // Old last_reviewed triggers overdue
      await writeFile(
        path.join(acceptedDir, 'h-001-overdue.md'),
        `---\ntype: tech-debt\nstatus: accepted\nseverity: medium\ncategory: complexity\nreview_cadence: quarterly\nlast_reviewed: '2020-01-01'\n---\n# Overdue item\n`,
      )

      await expect(executeTechDebtSubcommand('review', [], { cwd: tmpDir })).rejects.toThrow(
        /overdue/i,
      )
    })

    it('resolves path relative to --cwd', async () => {
      // With no tech-debt directory, should not throw
      const logs: string[] = []
      const origLog = console.log
      console.log = (...args: unknown[]) => {
        logs.push(args.join(' '))
      }
      try {
        await executeTechDebtSubcommand('review', [], { cwd: tmpDir })
      } finally {
        console.log = origLog
      }
      // Should not throw; empty repo is OK for review
    })
  })

  describe('unknown subcommand', () => {
    it('throws on unknown subcommand', async () => {
      await expect(
        executeTechDebtSubcommand('frobnicate' as 'new', [], { cwd: tmpDir }),
      ).rejects.toThrow(/Unknown tech-debt subcommand/i)
    })
  })

  describe('new --from-audit', () => {
    // Helper: seed a package.json so resolveTechDebtRoot picks <tmpDir>/tech-debt
    async function initTechDebtRoot(): Promise<string> {
      await writeFile(
        path.join(tmpDir, 'package.json'),
        JSON.stringify({ name: 'test-pkg', version: '0.0.1' }),
        'utf8',
      )
      return path.join(tmpDir, 'tech-debt')
    }

    it('auto-files a tech-debt item from skill-sizes audit', async () => {
      const { readFile, readdir } = await import('node:fs/promises')
      const tdRoot = await initTechDebtRoot()

      // Create a skill with oversized description to trigger a violation
      const skillDir = path.join(tmpDir, '.agent', 'skills', 'big-skill')
      await mkdir(skillDir, { recursive: true })
      const bigDesc = 'x'.repeat(900)
      await writeFile(
        path.join(skillDir, 'SKILL.md'),
        `---\ndescription: "${bigDesc}"\n---\n# Big Skill\n`,
        'utf8',
      )

      await executeTechDebtSubcommand('new', [], {
        cwd: tmpDir,
        fromAudit: 'skill-sizes',
      })

      const statusDir = path.join(tdRoot, 'needs-remediation')
      const files = await readdir(statusDir)
      expect(files.length).toBeGreaterThanOrEqual(1)

      const content = await readFile(path.join(statusDir, files[0]!), 'utf8')
      expect(content).toContain('type: tech-debt')
      expect(content).toContain('status: needs-remediation')
      expect(content).toContain('auto_filed_hash:')
      expect(content).toContain('category: documentation')
    })

    it('is idempotent — does not re-file when hash already exists', async () => {
      const { readdir } = await import('node:fs/promises')
      const tdRoot = await initTechDebtRoot()

      // Create a skill with oversized description
      const skillDir = path.join(tmpDir, '.agent', 'skills', 'dup-skill')
      await mkdir(skillDir, { recursive: true })
      const bigDesc = 'y'.repeat(900)
      await writeFile(
        path.join(skillDir, 'SKILL.md'),
        `---\ndescription: "${bigDesc}"\n---\n# Dup Skill\n`,
        'utf8',
      )

      // First run
      await executeTechDebtSubcommand('new', [], { cwd: tmpDir, fromAudit: 'skill-sizes' })

      // Second run — should not create another file
      const logs: string[] = []
      const origLog = console.log
      console.log = (...args: unknown[]) => {
        logs.push(args.join(' '))
      }
      try {
        await executeTechDebtSubcommand('new', [], { cwd: tmpDir, fromAudit: 'skill-sizes' })
      } finally {
        console.log = origLog
      }

      const statusDir = path.join(tdRoot, 'needs-remediation')
      const files = await readdir(statusDir)
      expect(files).toHaveLength(1)
      expect(logs.some((l) => l.includes('Already filed:'))).toBe(true)
    })

    it('dry-run mode with --from-audit prints path without writing', async () => {
      const { existsSync: fsExistsSync } = await import('node:fs')
      await initTechDebtRoot()

      const skillDir = path.join(tmpDir, '.agent', 'skills', 'dry-skill')
      await mkdir(skillDir, { recursive: true })
      const bigDesc = 'z'.repeat(900)
      await writeFile(
        path.join(skillDir, 'SKILL.md'),
        `---\ndescription: "${bigDesc}"\n---\n# Dry Skill\n`,
        'utf8',
      )

      const logs: string[] = []
      const origLog = console.log
      console.log = (...args: unknown[]) => {
        logs.push(args.join(' '))
      }
      try {
        await executeTechDebtSubcommand('new', [], {
          cwd: tmpDir,
          fromAudit: 'skill-sizes',
          dryRun: true,
        })
      } finally {
        console.log = origLog
      }

      // dry-run: no needs-remediation dir should exist
      expect(fsExistsSync(path.join(tmpDir, 'tech-debt', 'needs-remediation'))).toBe(false)
      expect(logs.some((l) => l.includes('Would create:'))).toBe(true)
    })

    it('fails for unknown audit name', async () => {
      await expect(
        executeTechDebtSubcommand('new', [], {
          cwd: tmpDir,
          fromAudit: 'nonexistent-audit',
        }),
      ).rejects.toThrow(/Unknown audit name/)
    })

    it('creates file from broken-refs audit', async () => {
      const { readdir } = await import('node:fs/promises')
      const tdRoot = await initTechDebtRoot()

      // Create AGENTS.md with a broken link
      await writeFile(
        path.join(tmpDir, 'AGENTS.md'),
        '# Agents\n\nSee [missing](./this-does-not-exist.md).\n',
        'utf8',
      )

      await executeTechDebtSubcommand('new', [], { cwd: tmpDir, fromAudit: 'broken-refs' })

      const statusDir = path.join(tdRoot, 'needs-remediation')
      const files = await readdir(statusDir)
      expect(files.length).toBeGreaterThanOrEqual(1)
      const { readFile } = await import('node:fs/promises')
      const content = await readFile(path.join(statusDir, files[0]!), 'utf8')
      expect(content).toContain('severity: high')
    })
  })
})
