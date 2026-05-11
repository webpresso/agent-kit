import { mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  auditMemoryRotation,
  auditMemoryRotationAsRepoResult,
  type RotationLogEntry,
} from './memory-rotation.js'

let tmpDir: string

beforeEach(async () => {
  tmpDir = path.join(
    os.tmpdir(),
    `ak-mem-rotation-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  )
  await mkdir(tmpDir, { recursive: true })
})

afterEach(async () => {
  await rm(tmpDir, { recursive: true, force: true })
})

async function writeRotationLog(entries: RotationLogEntry[]): Promise<void> {
  const agentDir = path.join(tmpDir, '.agent')
  await mkdir(agentDir, { recursive: true })
  const lines = entries.map((e) => JSON.stringify(e)).join('\n')
  await writeFile(path.join(agentDir, '.rotation-log.jsonl'), lines, 'utf8')
}

function recentEntry(overrides: Partial<RotationLogEntry> = {}): RotationLogEntry {
  const daysAgo = 5
  const ts = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString()
  return {
    timestamp: ts,
    sectionSlug: 'my-section',
    sourcePath: '.agent/memory.md',
    archivedTo: '.agent/archive/my-section.md',
    reason: 'threshold_days: 90, last_touched: 2026-01-01',
    ...overrides,
  }
}

function oldEntry(overrides: Partial<RotationLogEntry> = {}): RotationLogEntry {
  const daysAgo = 60
  const ts = new Date(Date.now() - daysAgo * 24 * 60 * 60 * 1000).toISOString()
  return {
    timestamp: ts,
    sectionSlug: 'old-section',
    sourcePath: '.agent/memory.md',
    archivedTo: '.agent/archive/old-section.md',
    reason: 'threshold_days: 30',
    ...overrides,
  }
}

describe('auditMemoryRotation', () => {
  it('returns pass=true when no rotation log exists', () => {
    const result = auditMemoryRotation(tmpDir)
    expect(result.pass).toBe(true)
    expect(result.recentEvents).toHaveLength(0)
    expect(result.checked).toBe(0)
  })

  it('surfaces recent events within window', async () => {
    await writeRotationLog([recentEntry()])
    const result = auditMemoryRotation(tmpDir)
    expect(result.recentEvents).toHaveLength(1)
    expect(result.recentEvents[0]?.sectionSlug).toBe('my-section')
    // Default non-strict: no violations even if unacked
    expect(result.pass).toBe(true)
    expect(result.violations).toHaveLength(0)
  })

  it('excludes entries older than window', async () => {
    await writeRotationLog([oldEntry(), recentEntry()])
    const result = auditMemoryRotation(tmpDir, { windowDays: 30 })
    expect(result.recentEvents).toHaveLength(1)
    expect(result.recentEvents[0]?.sectionSlug).toBe('my-section')
  })

  it('respects custom windowDays', async () => {
    await writeRotationLog([recentEntry()])
    const result = auditMemoryRotation(tmpDir, { windowDays: 3 })
    // 5-day-old entry should be outside 3-day window
    expect(result.recentEvents).toHaveLength(0)
  })

  it('strict mode fails for unacknowledged rotations', async () => {
    await writeRotationLog([recentEntry()])
    const result = auditMemoryRotation(tmpDir, { strict: true })
    expect(result.pass).toBe(false)
    expect(result.violations.length).toBeGreaterThan(0)
    expect(result.violations[0]?.message).toContain('Unacknowledged rotation')
  })

  it('strict mode passes when rotation is acked', async () => {
    // Create source file with ack marker
    const sourcePath = '.agent/memory.md'
    await mkdir(path.join(tmpDir, '.agent'), { recursive: true })
    await writeFile(
      path.join(tmpDir, sourcePath),
      'last_rotation_acked: 2026-05-01\n# Memory\n',
      'utf8',
    )
    await writeRotationLog([recentEntry({ sourcePath })])
    const result = auditMemoryRotation(tmpDir, { strict: true })
    expect(result.pass).toBe(true)
    expect(result.recentEvents[0]?.acked).toBe(true)
  })

  it('skips malformed JSONL lines', async () => {
    const agentDir = path.join(tmpDir, '.agent')
    await mkdir(agentDir, { recursive: true })
    const lines = [
      'not-json',
      JSON.stringify(recentEntry()),
      '{"incomplete":',
      '',
    ].join('\n')
    await writeFile(path.join(agentDir, '.rotation-log.jsonl'), lines, 'utf8')
    const result = auditMemoryRotation(tmpDir)
    // Only the valid entry should appear
    expect(result.recentEvents).toHaveLength(1)
  })

  it('handles empty rotation log', async () => {
    const agentDir = path.join(tmpDir, '.agent')
    await mkdir(agentDir, { recursive: true })
    await writeFile(path.join(agentDir, '.rotation-log.jsonl'), '', 'utf8')
    const result = auditMemoryRotation(tmpDir)
    expect(result.pass).toBe(true)
    expect(result.recentEvents).toHaveLength(0)
  })

  it('non-strict mode always passes regardless of ack status', async () => {
    await writeRotationLog([recentEntry(), recentEntry({ sectionSlug: 'another' })])
    const result = auditMemoryRotation(tmpDir, { strict: false })
    expect(result.pass).toBe(true)
    expect(result.violations).toHaveLength(0)
    expect(result.recentEvents).toHaveLength(2)
  })
})

describe('auditMemoryRotationAsRepoResult', () => {
  it('wraps result in RepoAuditResult shape', () => {
    const result = auditMemoryRotationAsRepoResult(tmpDir)
    expect(result.ok).toBe(true)
    expect(result.title).toBe('Memory rotation audit')
    expect(typeof result.checked).toBe('number')
    expect(Array.isArray(result.violations)).toBe(true)
  })
})
