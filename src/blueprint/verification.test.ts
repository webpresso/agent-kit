/**
 * Verification block markdown helper tests (F10/R8/E14).
 *
 * Validates Evidence Contract input, serializes verification under a
 * canonical header, and updates blueprint markdown atomically.
 */

import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import type { Evidence } from './evidence.js'
import {
  applyVerification,
  parseVerificationBlock,
  serializeVerificationBlock,
  writeVerification,
  VERIFICATION_BLOCK_HEADER,
} from './verification.js'

const TS = '2026-05-13T12:00:00.000Z'

function passingTest(): Evidence {
  return {
    kind: 'test',
    result: 'pass',
    command: 'wp_test --package webpresso',
    exit_code: 0,
    ts: TS,
  }
}

function passingAudit(): Evidence {
  return {
    kind: 'audit',
    result: 'pass',
    audit_kind: 'tph-e2e',
    passed: true,
    ts: TS,
  }
}

function failingTest(): Evidence {
  return {
    kind: 'test',
    result: 'fail',
    command: 'wp_test',
    exit_code: 1,
    ts: TS,
  }
}

function sampleMarkdown(): string {
  return [
    '---',
    'type: blueprint',
    'status: in-progress',
    '---',
    '',
    '# Sample',
    '',
    '## Tasks',
    '',
    '#### [db] Task 1.1: First task',
    '',
    '**Status:** todo',
    '',
    '**Depends:** None',
    '',
    'Body paragraph.',
    '',
    '#### Task 1.2: Second task',
    '',
    '**Status:** todo',
    '',
    'More body.',
    '',
  ].join('\n')
}

describe('applyVerification', () => {
  it('rejects when evidence list is empty', () => {
    const result = applyVerification(sampleMarkdown(), '1.1', [])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.next_action).toBe('verify_task')
    }
  })

  it('rejects when zero items have result === pass', () => {
    const evidence: Evidence[] = [
      { kind: 'test', result: 'fail', command: 'wp_test', exit_code: 1, ts: TS },
    ]
    const result = applyVerification(sampleMarkdown(), '1.1', evidence)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.next_action).toBe('verify_task')
      expect(result.failures.length).toBeGreaterThan(0)
    }
  })

  it('rejects when any item has result === fail', () => {
    const evidence: Evidence[] = [passingTest(), failingTest()]
    const result = applyVerification(sampleMarkdown(), '1.1', evidence)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.next_action).toBe('verify_task')
    }
  })

  it('rejects when evidence input fails zod parse', () => {
    const result = applyVerification(sampleMarkdown(), '1.1', [
      // @ts-expect-error — deliberately invalid to test runtime rejection
      { ok: true },
    ])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.next_action).toBe('verify_task')
    }
  })

  it('rejects when target task does not exist', () => {
    const result = applyVerification(sampleMarkdown(), '9.9', [passingTest()])
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.failures.join('\n')).toMatch(/task/i)
    }
  })

  it('writes a verification block under canonical header when status is todo', () => {
    const result = applyVerification(sampleMarkdown(), '1.1', [passingTest()])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.markdown).toContain(VERIFICATION_BLOCK_HEADER)
    expect(result.status).toBe('done')
  })

  it('updates status to done in the target task', () => {
    const result = applyVerification(sampleMarkdown(), '1.1', [passingTest()])
    if (!result.ok) throw new Error('expected success')
    // Status line of task 1.1 should be done
    const task1Match = result.markdown.match(/#### \[db\] Task 1\.1:[\s\S]+?(?=\n####|$)/)
    expect(task1Match?.[0]).toContain('**Status:** done')
    // Task 1.2 must remain todo
    const task2Match = result.markdown.match(/#### Task 1\.2:[\s\S]+?(?=\n####|$)/)
    expect(task2Match?.[0]).toContain('**Status:** todo')
  })

  it('supports lane-prefixed task headings', () => {
    const md = sampleMarkdown()
    const result = applyVerification(md, '1.1', [passingTest()])
    expect(result.ok).toBe(true)
    if (!result.ok) return
    // Lane prefix should be preserved
    expect(result.markdown).toMatch(/#### \[db\] Task 1\.1:/)
  })

  it('is idempotent for identical canonical evidence', () => {
    const first = applyVerification(sampleMarkdown(), '1.1', [passingTest()])
    if (!first.ok) throw new Error('expected success on first apply')
    const second = applyVerification(first.markdown, '1.1', [passingTest()])
    if (!second.ok) throw new Error('expected success on idempotent reapply')
    expect(second.markdown).toBe(first.markdown)
    // Header appears exactly once
    const occurrences = second.markdown.split(VERIFICATION_BLOCK_HEADER).length - 1
    expect(occurrences).toBe(1)
  })

  it('replaces an existing verification block instead of appending', () => {
    const initial = applyVerification(sampleMarkdown(), '1.1', [passingTest()])
    if (!initial.ok) throw new Error('expected success')
    const updated = applyVerification(initial.markdown, '1.1', [passingAudit()])
    if (!updated.ok) throw new Error('expected success on replace')
    const occurrences = updated.markdown.split(VERIFICATION_BLOCK_HEADER).length - 1
    expect(occurrences).toBe(1)
    expect(updated.markdown).toContain('audit')
    expect(updated.markdown).toContain('tph-e2e')
  })

  it('leaves other tasks byte-identical', () => {
    const md = sampleMarkdown()
    const result = applyVerification(md, '1.1', [passingTest()])
    if (!result.ok) throw new Error('expected success')
    // Slice Task 1.2 section from both — must match exactly.
    const sliceTask12 = (s: string): string => {
      const idx = s.indexOf('#### Task 1.2')
      return s.slice(idx)
    }
    expect(sliceTask12(result.markdown)).toBe(sliceTask12(md))
  })

  it('round-trips evidence via parseVerificationBlock', () => {
    const evidence = [passingTest(), passingAudit()]
    const block = serializeVerificationBlock(evidence)
    const parsed = parseVerificationBlock(block)
    expect(parsed).toStrictEqual(evidence)
  })

  it('parses back evidence after applyVerification', () => {
    const evidence = [passingTest()]
    const result = applyVerification(sampleMarkdown(), '1.1', evidence)
    if (!result.ok) throw new Error('expected success')

    // Extract the verification block from the markdown.
    const startIdx = result.markdown.indexOf(VERIFICATION_BLOCK_HEADER)
    expect(startIdx).toBeGreaterThan(-1)
    const restAfterHeader = result.markdown.slice(startIdx)
    // Block ends at next task heading or end of file.
    const endMatch = restAfterHeader.match(/\n####|\n###\s+Phase|$/)
    const block = endMatch?.index ? restAfterHeader.slice(0, endMatch.index) : restAfterHeader

    const parsed = parseVerificationBlock(block)
    expect(parsed).toStrictEqual(evidence)
  })

  it('preserves task content outside the status/verification region', () => {
    const md = sampleMarkdown()
    const result = applyVerification(md, '1.1', [passingTest()])
    if (!result.ok) throw new Error('expected success')
    expect(result.markdown).toContain('Body paragraph.')
    expect(result.markdown).toContain('**Depends:** None')
  })
})

describe('writeVerification (filesystem + re-ingest hook)', () => {
  it('writes markdown to disk and invokes reingest hook with cwd', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'verification-test-'))
    try {
      const filePath = path.join(dir, '_overview.md')
      writeFileSync(filePath, sampleMarkdown(), 'utf8')

      const reingest = vi.fn(async () => {
        /* no-op */
      })

      const result = await writeVerification({
        filePath,
        taskId: '1.1',
        evidence: [passingTest()],
        cwd: dir,
        reingest,
      })

      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(result.status).toBe('done')

      const after = readFileSync(filePath, 'utf8')
      expect(after).toContain(VERIFICATION_BLOCK_HEADER)
      expect(after).toMatch(/#### \[db\] Task 1\.1:[\s\S]*\*\*Status:\*\* done/)

      expect(reingest).toHaveBeenCalledTimes(1)
      expect(reingest).toHaveBeenCalledWith({ cwd: dir })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('does not touch the file or call reingest when evidence is invalid', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'verification-test-'))
    try {
      const filePath = path.join(dir, '_overview.md')
      const original = sampleMarkdown()
      writeFileSync(filePath, original, 'utf8')

      const reingest = vi.fn(async () => {
        /* no-op */
      })

      const result = await writeVerification({
        filePath,
        taskId: '1.1',
        evidence: [failingTest()],
        cwd: dir,
        reingest,
      })

      expect(result.ok).toBe(false)
      expect(reingest).not.toHaveBeenCalled()
      expect(readFileSync(filePath, 'utf8')).toBe(original)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('is idempotent on the filesystem for identical evidence', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'verification-test-'))
    try {
      const filePath = path.join(dir, '_overview.md')
      writeFileSync(filePath, sampleMarkdown(), 'utf8')

      const reingest = vi.fn(async () => {
        /* no-op */
      })

      const first = await writeVerification({
        filePath,
        taskId: '1.1',
        evidence: [passingTest()],
        cwd: dir,
        reingest,
      })
      expect(first.ok).toBe(true)
      const afterFirst = readFileSync(filePath, 'utf8')

      const second = await writeVerification({
        filePath,
        taskId: '1.1',
        evidence: [passingTest()],
        cwd: dir,
        reingest,
      })
      expect(second.ok).toBe(true)
      expect(readFileSync(filePath, 'utf8')).toBe(afterFirst)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
