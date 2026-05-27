import { existsSync, readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const mcpDir = path.dirname(new URL(import.meta.url).pathname)

function readRelative(file: string): string {
  return readFileSync(path.join(mcpDir, file), 'utf8')
}

function lineCount(file: string): number {
  return readRelative(file).split('\n').length
}

describe('blueprint-server test architecture guard', () => {
  it('keeps heavyweight blueprint-server coverage split by behavior surface', () => {
    const expectedSplitFiles = [
      'blueprint-server.test.ts',
      'blueprint-server.list-projection.test.ts',
      'blueprint-server.get-projection.test.ts',
      'blueprint-server.context-projection.test.ts',
      'blueprint-server.verify-idempotency.test.ts',
      'blueprint-server.platform-first.task-advance.test.ts',
      'blueprint-server.platform-first.lifecycle.test.ts',
      'blueprint-server.platform-first.scaffold-read.test.ts',
      'blueprint-server.platform-timeouts.test.ts',
    ]

    for (const file of expectedSplitFiles) {
      expect(existsSync(path.join(mcpDir, file)), `${file} should exist`).toBe(true)
    }
    expect(existsSync(path.join(mcpDir, 'blueprint-server.read-projection.test.ts'))).toBe(false)
    expect(existsSync(path.join(mcpDir, 'blueprint-server.platform-first.test.ts'))).toBe(false)
  })

  it('keeps split files under bounded serial-size budgets', () => {
    expect(lineCount('blueprint-server.test.ts')).toBeLessThanOrEqual(400)
    expect(lineCount('blueprint-server.list-projection.test.ts')).toBeLessThanOrEqual(160)
    expect(lineCount('blueprint-server.get-projection.test.ts')).toBeLessThanOrEqual(140)
    expect(lineCount('blueprint-server.context-projection.test.ts')).toBeLessThanOrEqual(140)
    expect(lineCount('blueprint-server.verify-idempotency.test.ts')).toBeLessThanOrEqual(320)
    expect(lineCount('blueprint-server.platform-first.task-advance.test.ts')).toBeLessThanOrEqual(160)
    expect(lineCount('blueprint-server.platform-first.lifecycle.test.ts')).toBeLessThanOrEqual(180)
    expect(lineCount('blueprint-server.platform-first.scaffold-read.test.ts')).toBeLessThanOrEqual(180)
    expect(lineCount('blueprint-server.platform-timeouts.test.ts')).toBeLessThanOrEqual(280)
  })

  it('does not hide performance issues with in-file concurrency or oversized timeout literals', () => {
    const blueprintServerTests = readdirSync(mcpDir).filter(
      (file) => file.startsWith('blueprint-server') && file.endsWith('.test.ts'),
    )
    const inFileConcurrencyToken = 'test.' + 'concurrent'
    const oldTimeoutCapToken = '120' + '000'

    for (const file of blueprintServerTests) {
      const source = readRelative(file)
      expect(source, `${file} must rely on file splitting, not ${inFileConcurrencyToken}`).not.toContain(
        inFileConcurrencyToken,
      )
      expect(source, `${file} must not bake in old 120s runner caps`).not.toContain(
        oldTimeoutCapToken,
      )
    }
  })

  it('keeps the shared test harness out of production MCP modules', () => {
    const productionMcpFiles = readdirSync(mcpDir).filter(
      (file) =>
        file.endsWith('.ts') &&
        !file.endsWith('.test.ts') &&
        !file.endsWith('.test-harness.ts'),
    )

    for (const file of productionMcpFiles) {
      expect(readRelative(file), `${file} should not import the test harness`).not.toContain(
        'blueprint-server.test-harness',
      )
    }
  })
})
