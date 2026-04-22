/**
 * Tests for Conflict Resolution Policy Module
 *
 * Implements last-write-wins conflict resolution with audit trail.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  type ConflictAuditEntry,
  type ConflictInfo,
  ConflictResolver,
  createConflictResolver,
} from './conflict.js'

describe('ConflictResolver', () => {
  let resolver: ConflictResolver

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2024-01-01T00:00:00Z'))
    resolver = createConflictResolver()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('createConflictResolver', () => {
    it('should create a resolver instance', () => {
      const instance = createConflictResolver()
      expect(instance).toBeInstanceOf(ConflictResolver)
    })

    it('should create a resolver with custom config', () => {
      const instance = createConflictResolver({ projectId: 'test-project' })
      expect(instance).toBeInstanceOf(ConflictResolver)
    })
  })

  describe('resolve', () => {
    it('should resolve empty conflicts array', () => {
      const result = resolver.resolve([])
      expect(result.resolved).toEqual([])
      expect(result.totalConflicts).toBe(0)
      expect(result.resolvedCount).toBe(0)
    })

    it('should resolve single conflict with last-write-wins', () => {
      const oldTime = new Date()
      oldTime.setMinutes(oldTime.getMinutes() - 5)

      const conflicts: ConflictInfo[] = [
        {
          filePath: 'src/index.ts',
          writes: [
            {
              content: 'old content',
              timestamp: oldTime,
              author: 'user-1',
            },
            {
              content: 'new content',
              timestamp: new Date(),
              author: 'user-2',
            },
          ],
        },
      ]

      const result = resolver.resolve(conflicts)

      expect(result.totalConflicts).toBe(1)
      expect(result.resolvedCount).toBe(1)
      expect(result.resolved).toHaveLength(1)
      expect(result.resolved[0]?.filePath).toBe('src/index.ts')
      expect(result.resolved[0]?.winningContent).toBe('new content')
      expect(result.resolved[0]?.winningAuthor).toBe('user-2')
    })

    it('should select write with latest timestamp as winner', () => {
      const latestTime = new Date()
      const middleTime = new Date()
      middleTime.setHours(middleTime.getHours() - 1)
      const oldestTime = new Date()
      oldestTime.setHours(oldestTime.getHours() - 3)

      const conflicts: ConflictInfo[] = [
        {
          filePath: 'config.json',
          writes: [
            {
              content: 'version: 3',
              timestamp: latestTime,
              author: 'agent-1',
            },
            {
              content: 'version: 1',
              timestamp: oldestTime,
              author: 'user-1',
            },
            {
              content: 'version: 2',
              timestamp: middleTime,
              author: 'system',
            },
          ],
        },
      ]

      const result = resolver.resolve(conflicts)

      expect(result.resolved[0]?.winningContent).toBe('version: 3')
      expect(result.resolved[0]?.winningAuthor).toBe('agent-1')
      expect(result.resolved[0]?.winningTimestamp).toEqual(latestTime)
    })

    it('should resolve multiple conflicts independently', () => {
      const aNew = new Date()
      aNew.setHours(aNew.getHours() - 1)
      const aOld = new Date()
      aOld.setHours(aOld.getHours() - 2)
      const bNew = new Date()
      const bOld = new Date()
      bOld.setHours(bOld.getHours() - 4)

      const conflicts: ConflictInfo[] = [
        {
          filePath: 'file-a.ts',
          writes: [
            { content: 'a-old', timestamp: aOld, author: 'user-1' },
            { content: 'a-new', timestamp: aNew, author: 'user-2' },
          ],
        },
        {
          filePath: 'file-b.ts',
          writes: [
            { content: 'b-new', timestamp: bNew, author: 'agent-1' },
            { content: 'b-old', timestamp: bOld, author: 'user-1' },
          ],
        },
      ]

      const result = resolver.resolve(conflicts)

      expect(result.totalConflicts).toBe(2)
      expect(result.resolvedCount).toBe(2)

      const fileA = result.resolved.find((r) => r.filePath === 'file-a.ts')
      const fileB = result.resolved.find((r) => r.filePath === 'file-b.ts')

      expect(fileA?.winningContent).toBe('a-new')
      expect(fileA?.winningAuthor).toBe('user-2')
      expect(fileB?.winningContent).toBe('b-new')
      expect(fileB?.winningAuthor).toBe('agent-1')
    })

    it('should handle conflict with single write (no actual conflict)', () => {
      const conflicts: ConflictInfo[] = [
        {
          filePath: 'single.ts',
          writes: [
            {
              content: 'only content',
              timestamp: new Date(),
              author: 'user-1',
            },
          ],
        },
      ]

      const result = resolver.resolve(conflicts)

      expect(result.totalConflicts).toBe(1)
      expect(result.resolvedCount).toBe(1)
      expect(result.resolved[0]?.winningContent).toBe('only content')
    })

    it('should handle writes with identical timestamps (first in array wins)', () => {
      const sameTime = new Date()
      const conflicts: ConflictInfo[] = [
        {
          filePath: 'same-time.ts',
          writes: [
            { content: 'first', timestamp: sameTime, author: 'user-1' },
            { content: 'second', timestamp: sameTime, author: 'user-2' },
          ],
        },
      ]

      const result = resolver.resolve(conflicts)

      // When timestamps are equal, stable sort preserves input order — 'first' wins
      expect(result.resolved[0]?.winningContent).toBe('first')
    })

    it('should record all losing writes', () => {
      const newest = new Date()
      const middle = new Date()
      middle.setHours(middle.getHours() - 1)
      const oldest = new Date()
      oldest.setHours(oldest.getHours() - 2)

      const conflicts: ConflictInfo[] = [
        {
          filePath: 'multi-write.ts',
          writes: [
            { content: 'oldest', timestamp: oldest, author: 'user-1' },
            { content: 'middle', timestamp: middle, author: 'user-2' },
            { content: 'newest', timestamp: newest, author: 'user-3' },
          ],
        },
      ]

      const result = resolver.resolve(conflicts)

      expect(result.resolved[0]?.winningContent).toBe('newest')
      expect(result.resolved[0]?.losingWrites).toHaveLength(2)

      const losingAuthors = result.resolved[0]?.losingWrites.map((w) => w.author)
      expect(losingAuthors).toContain('user-1')
      expect(losingAuthors).toContain('user-2')
    })
  })

  describe('getAuditLog', () => {
    it('should return empty audit log initially', () => {
      const auditLog = resolver.getAuditLog()
      expect(auditLog).toEqual([])
    })

    it('should record resolution in audit log', () => {
      const newTime = new Date()
      const oldTime = new Date()
      oldTime.setHours(oldTime.getHours() - 1)

      const conflicts: ConflictInfo[] = [
        {
          filePath: 'audited.ts',
          writes: [
            { content: 'old', timestamp: oldTime, author: 'user-1' },
            { content: 'new', timestamp: newTime, author: 'user-2' },
          ],
        },
      ]

      resolver.resolve(conflicts)
      const auditLog = resolver.getAuditLog()

      expect(auditLog).toHaveLength(1)
      expect(auditLog[0]?.filePath).toBe('audited.ts')
      expect(auditLog[0]?.winner.author).toBe('user-2')
      expect(auditLog[0]?.losers).toHaveLength(1)
      expect(auditLog[0]?.losers[0]?.author).toBe('user-1')
      expect(auditLog[0]?.reason).toBe('last-write-wins: timestamp comparison')
    })

    it('should accumulate audit entries across multiple resolutions', () => {
      const time1New = new Date()
      const time1Old = new Date()
      time1Old.setHours(time1Old.getHours() - 1)
      const time2New = new Date()
      time2New.setHours(time2New.getHours() + 1)
      const time2Old = new Date()
      time2Old.setHours(time2Old.getHours() - 3)

      const conflicts1: ConflictInfo[] = [
        {
          filePath: 'first.ts',
          writes: [
            { content: 'old', timestamp: time1Old, author: 'user-1' },
            { content: 'new', timestamp: time1New, author: 'user-2' },
          ],
        },
      ]

      const conflicts2: ConflictInfo[] = [
        {
          filePath: 'second.ts',
          writes: [
            { content: 'a', timestamp: time2Old, author: 'agent-1' },
            { content: 'b', timestamp: time2New, author: 'agent-2' },
          ],
        },
      ]

      resolver.resolve(conflicts1)
      resolver.resolve(conflicts2)

      const auditLog = resolver.getAuditLog()
      expect(auditLog).toHaveLength(2)
      expect(auditLog[0]?.filePath).toBe('first.ts')
      expect(auditLog[1]?.filePath).toBe('second.ts')
    })

    it('should include timestamp in audit entry', () => {
      const beforeResolve = new Date()

      const conflicts: ConflictInfo[] = [
        {
          filePath: 'timed.ts',
          writes: [
            { content: 'old', timestamp: new Date('2026-01-29T10:00:00Z'), author: 'user-1' },
            { content: 'new', timestamp: new Date('2026-01-29T11:00:00Z'), author: 'user-2' },
          ],
        },
      ]

      resolver.resolve(conflicts)
      const auditLog = resolver.getAuditLog()

      expect(auditLog[0]?.timestamp).toBeInstanceOf(Date)
      expect(auditLog[0]?.timestamp.getTime()).toBeGreaterThanOrEqual(beforeResolve.getTime())
    })

    it('should include project ID in audit entries when configured', () => {
      const projectResolver = createConflictResolver({ projectId: 'proj_123' })

      const newTime = new Date()
      const oldTime = new Date()
      oldTime.setHours(oldTime.getHours() - 1)

      const conflicts: ConflictInfo[] = [
        {
          filePath: 'project-file.ts',
          writes: [
            { content: 'old', timestamp: oldTime, author: 'user-1' },
            { content: 'new', timestamp: newTime, author: 'user-2' },
          ],
        },
      ]

      projectResolver.resolve(conflicts)
      const auditLog = projectResolver.getAuditLog()

      expect(auditLog[0]?.projectId).toBe('proj_123')
    })
  })

  describe('clearAuditLog', () => {
    it('should clear the audit log', () => {
      const newTime = new Date()
      const oldTime = new Date()
      oldTime.setHours(oldTime.getHours() - 1)

      const conflicts: ConflictInfo[] = [
        {
          filePath: 'to-clear.ts',
          writes: [
            { content: 'old', timestamp: oldTime, author: 'user-1' },
            { content: 'new', timestamp: newTime, author: 'user-2' },
          ],
        },
      ]

      resolver.resolve(conflicts)
      expect(resolver.getAuditLog()).toHaveLength(1)

      resolver.clearAuditLog()
      expect(resolver.getAuditLog()).toHaveLength(0)
    })
  })

  describe('edge cases', () => {
    it('should handle empty writes array', () => {
      const conflicts: ConflictInfo[] = [
        {
          filePath: 'empty-writes.ts',
          writes: [],
        },
      ]

      const result = resolver.resolve(conflicts)

      // No writes means nothing to resolve
      expect(result.totalConflicts).toBe(1)
      expect(result.resolvedCount).toBe(0)
      expect(result.resolved).toHaveLength(0)
    })

    it('should handle very old timestamps', () => {
      const modern = new Date()
      const ancient = new Date()
      ancient.setFullYear(ancient.getFullYear() - 34)

      const conflicts: ConflictInfo[] = [
        {
          filePath: 'old-dates.ts',
          writes: [
            { content: 'ancient', timestamp: ancient, author: 'user-1' },
            { content: 'modern', timestamp: modern, author: 'user-2' },
          ],
        },
      ]

      const result = resolver.resolve(conflicts)

      expect(result.resolved[0]?.winningContent).toBe('modern')
    })

    it('should preserve content with special characters', () => {
      const specialContent = 'const emoji = "🚀"; // Unicode\n\tindented\r\nnewlines'
      const newTime = new Date()
      const oldTime = new Date()
      oldTime.setHours(oldTime.getHours() - 1)

      const conflicts: ConflictInfo[] = [
        {
          filePath: 'special.ts',
          writes: [
            { content: 'old', timestamp: oldTime, author: 'user-1' },
            {
              content: specialContent,
              timestamp: newTime,
              author: 'user-2',
            },
          ],
        },
      ]

      const result = resolver.resolve(conflicts)

      expect(result.resolved[0]?.winningContent).toBe(specialContent)
    })
  })

  describe('audit log structure', () => {
    it('should have correct audit entry structure', () => {
      const winnerTime = new Date()
      const loserTime = new Date()
      loserTime.setHours(loserTime.getHours() - 1)

      const conflicts: ConflictInfo[] = [
        {
          filePath: 'structure-test.ts',
          writes: [
            {
              content: 'loser-content',
              timestamp: loserTime,
              author: 'loser-author',
            },
            {
              content: 'winner-content',
              timestamp: winnerTime,
              author: 'winner-author',
            },
          ],
        },
      ]

      resolver.resolve(conflicts)
      const entry = resolver.getAuditLog()[0] as ConflictAuditEntry

      // Verify all required fields
      expect(entry.timestamp).toBeInstanceOf(Date)
      expect(entry.filePath).toBe('structure-test.ts')
      expect(entry.winner).toEqual({
        content: 'winner-content',
        timestamp: winnerTime,
        author: 'winner-author',
      })
      expect(entry.losers).toHaveLength(1)
      expect(entry.losers[0]).toEqual({
        content: 'loser-content',
        timestamp: loserTime,
        author: 'loser-author',
      })
      expect(entry.reason).toBe('last-write-wins: timestamp comparison')
    })
  })

  describe('empty writes guard (line 147 mutant)', () => {
    it('returns null for empty writes and does not add audit entry', () => {
      const conflicts: ConflictInfo[] = [
        {
          filePath: 'empty.ts',
          writes: [],
        },
      ]

      const result = resolver.resolve(conflicts)

      // Explicitly verify that empty writes produces zero resolved items
      // This kills the mutant that changes `!writes.length` to `false`
      // because if the guard is skipped, sort+access would produce a result
      expect(result.resolved).toHaveLength(0)
      expect(result.resolvedCount).toBe(0)
      expect(result.totalConflicts).toBe(1)

      // No audit entry should be recorded for empty writes
      expect(resolver.getAuditLog()).toHaveLength(0)
    })

    it('resolves non-empty writes but skips empty writes in mixed array', () => {
      const newTime = new Date()
      const oldTime = new Date()
      oldTime.setHours(oldTime.getHours() - 1)

      const conflicts: ConflictInfo[] = [
        {
          filePath: 'empty.ts',
          writes: [],
        },
        {
          filePath: 'real.ts',
          writes: [
            { content: 'old', timestamp: oldTime, author: 'user-1' },
            { content: 'new', timestamp: newTime, author: 'user-2' },
          ],
        },
      ]

      const result = resolver.resolve(conflicts)

      // Total is 2 conflicts, but only 1 resolved (the non-empty one)
      expect(result.totalConflicts).toBe(2)
      expect(result.resolvedCount).toBe(1)
      expect(result.resolved).toHaveLength(1)
      expect(result.resolved[0]?.filePath).toBe('real.ts')

      // Only 1 audit entry for the real conflict
      expect(resolver.getAuditLog()).toHaveLength(1)
      expect(resolver.getAuditLog()[0]?.filePath).toBe('real.ts')
    })
  })

  describe('winner guard (line 157 mutant)', () => {
    it('single write produces exactly one winner and zero losers', () => {
      // This tests the path where sortedWrites has exactly one element,
      // verifying that winner = sortedWrites[0] is properly accessed.
      // If `!winner` guard is mutated to `false`, the behavior for a single
      // write wouldn't change; but this ensures the code path is exercised.
      const now = new Date()
      const conflicts: ConflictInfo[] = [
        {
          filePath: 'single-write.ts',
          writes: [{ content: 'only', timestamp: now, author: 'solo-user' }],
        },
      ]

      const result = resolver.resolve(conflicts)

      expect(result.resolvedCount).toBe(1)
      expect(result.resolved[0]?.winningContent).toBe('only')
      expect(result.resolved[0]?.winningAuthor).toBe('solo-user')
      expect(result.resolved[0]?.winningTimestamp).toEqual(now)
      expect(result.resolved[0]?.losingWrites).toHaveLength(0)
      expect(result.resolved[0]?.losingWrites).toEqual([])
    })
  })

  describe('projectId conditional (line 188 mutant)', () => {
    it('omits projectId from audit entry when not configured', () => {
      // Default resolver has no projectId configured
      const newTime = new Date()
      const oldTime = new Date()
      oldTime.setHours(oldTime.getHours() - 1)

      const conflicts: ConflictInfo[] = [
        {
          filePath: 'no-project.ts',
          writes: [
            { content: 'old', timestamp: oldTime, author: 'user-1' },
            { content: 'new', timestamp: newTime, author: 'user-2' },
          ],
        },
      ]

      resolver.resolve(conflicts)
      const entry = resolver.getAuditLog()[0] as ConflictAuditEntry

      // When projectId is not configured, the audit entry must NOT have projectId
      // This kills the mutant that changes `if (this.projectId)` to `if (true)`
      // because if always true, entry.projectId would be set to undefined
      expect(entry).not.toHaveProperty('projectId')
      expect(Object.keys(entry)).not.toContain('projectId')
    })

    it('includes projectId in audit entry when configured', () => {
      const projectResolver = createConflictResolver({ projectId: 'my-project' })
      const newTime = new Date()
      const oldTime = new Date()
      oldTime.setHours(oldTime.getHours() - 1)

      const conflicts: ConflictInfo[] = [
        {
          filePath: 'with-project.ts',
          writes: [
            { content: 'old', timestamp: oldTime, author: 'user-1' },
            { content: 'new', timestamp: newTime, author: 'user-2' },
          ],
        },
      ]

      projectResolver.resolve(conflicts)
      const entry = projectResolver.getAuditLog()[0] as ConflictAuditEntry

      // When projectId IS configured, the audit entry MUST have it
      expect(entry).toHaveProperty('projectId')
      expect(entry.projectId).toBe('my-project')
    })

    it('resolver without projectId and resolver with projectId produce different audit entries', () => {
      // Direct comparison: the same conflict resolved with and without projectId
      // produces structurally different audit entries
      const noProjectResolver = createConflictResolver()
      const withProjectResolver = createConflictResolver({ projectId: 'proj-abc' })

      const newTime = new Date()
      const oldTime = new Date()
      oldTime.setHours(oldTime.getHours() - 1)

      const conflicts: ConflictInfo[] = [
        {
          filePath: 'compare.ts',
          writes: [
            { content: 'old', timestamp: oldTime, author: 'user-1' },
            { content: 'new', timestamp: newTime, author: 'user-2' },
          ],
        },
      ]

      noProjectResolver.resolve(conflicts)
      withProjectResolver.resolve(conflicts)

      const entryWithout = noProjectResolver.getAuditLog()[0] as ConflictAuditEntry
      const entryWith = withProjectResolver.getAuditLog()[0] as ConflictAuditEntry

      // Structural difference: one has projectId key, the other does not
      const keysWithout = Object.keys(entryWithout)
      const keysWith = Object.keys(entryWith)

      expect(keysWithout).not.toContain('projectId')
      expect(keysWith).toContain('projectId')
      expect(entryWith.projectId).toBe('proj-abc')
    })
  })
})
