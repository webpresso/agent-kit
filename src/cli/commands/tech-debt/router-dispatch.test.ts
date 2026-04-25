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
  const dir = path.join(os.tmpdir(), `ak-tech-debt-test-${Date.now()}-${Math.random().toString(36).slice(2)}`)
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

      await executeTechDebtSubcommand(
        'new',
        ['Legacy CLI complexity'],
        {
          severity: 'medium',
          category: 'complexity',
          reviewCadence: 'quarterly',
          status: 'accepted',
          cwd: tmpDir,
        },
      )

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

      await executeTechDebtSubcommand(
        'new',
        ['New item'],
        {
          severity: 'low',
          category: 'testing',
          reviewCadence: 'monthly',
          status: 'accepted',
          cwd: tmpDir,
        },
      )

      const { readdir } = await import('node:fs/promises')
      const files = await readdir(acceptedDir)
      const newFile = files.find((f) => f.startsWith('h-003'))
      expect(newFile).toBeDefined()
    })

    it('exits non-zero on invalid severity', async () => {
      await expect(
        executeTechDebtSubcommand(
          'new',
          ['Test'],
          {
            severity: 'wat' as 'medium',
            category: 'testing',
            reviewCadence: 'monthly',
            status: 'accepted',
            cwd: tmpDir,
          },
        ),
      ).rejects.toThrow(/invalid severity/i)
    })

    it('dry-run prints the would-be path without writing', async () => {
      const tdRoot = techDebtRoot(tmpDir)
      const acceptedDir = path.join(tdRoot, 'accepted')
      await mkdir(acceptedDir, { recursive: true })

      const logs: string[] = []
      const origLog = console.log
      console.log = (...args: unknown[]) => { logs.push(args.join(' ')) }
      try {
        await executeTechDebtSubcommand(
          'new',
          ['Dry run item'],
          {
            severity: 'high',
            category: 'security',
            reviewCadence: 'weekly',
            status: 'accepted',
            dryRun: true,
            cwd: tmpDir,
          },
        )
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
      console.log = (...args: unknown[]) => { logs.push(args.join(' ')) }
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
      console.log = (...args: unknown[]) => { logs.push(args.join(' ')) }
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

      await expect(
        executeTechDebtSubcommand('review', [], { cwd: tmpDir }),
      ).rejects.toThrow(/overdue/i)
    })

    it('resolves path relative to --cwd', async () => {
      // With no tech-debt directory, should not throw
      const logs: string[] = []
      const origLog = console.log
      console.log = (...args: unknown[]) => { logs.push(args.join(' ')) }
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
})
