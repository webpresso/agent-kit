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

function beforeEachBlocks(source: string): string[] {
  const blocks: string[] = []
  let searchFrom = 0
  while (true) {
    const beforeEachIndex = source.indexOf('beforeEach', searchFrom)
    if (beforeEachIndex === -1) return blocks
    const bodyStart = source.indexOf('{', beforeEachIndex)
    if (bodyStart === -1) return blocks
    let depth = 0
    for (let index = bodyStart; index < source.length; index += 1) {
      const char = source[index]
      if (char === '{') depth += 1
      if (char === '}') {
        depth -= 1
        if (depth === 0) {
          blocks.push(source.slice(bodyStart, index + 1))
          searchFrom = index + 1
          break
        }
      }
    }
  }
}

function hasLazyBlueprintHarnessBeforeEach(source: string): boolean {
  return beforeEachBlocks(source).some((block) => block.includes('makeLazyBlueprintHarness'))
}

describe('blueprint-server test architecture guard', () => {
  it('keeps heavyweight blueprint-server coverage split by behavior surface', () => {
    const expectedSplitFiles = [
      'blueprint-server.test.ts',
      'blueprint-server.projects.aggregate-scope.test.ts',
      'blueprint-server.projects.workspace-targeting.test.ts',
      'blueprint-server.projects.timeouts.test.ts',
      'blueprint-server.list-projection.test.ts',
      'blueprint-server.get-projection.test.ts',
      'blueprint-server.context-projection.test.ts',
      'blueprint-server.verify-idempotency.test.ts',
      'blueprint-server.platform-first.task-advance.test.ts',
      'blueprint-server.platform-first.lifecycle.test.ts',
      'blueprint-server.platform-first.finalize.test.ts',
      'blueprint-server.platform-first.scaffold-read.test.ts',
      'blueprint-server.platform-timeouts.test.ts',
    ]

    for (const file of expectedSplitFiles) {
      expect(existsSync(path.join(mcpDir, file)), `${file} should exist`).toBe(true)
    }
    expect(existsSync(path.join(mcpDir, 'blueprint-server.projects.test.ts'))).toBe(false)
    expect(existsSync(path.join(mcpDir, 'blueprint-server.read-projection.test.ts'))).toBe(false)
    expect(existsSync(path.join(mcpDir, 'blueprint-server.platform-first.test.ts'))).toBe(false)
  })

  it('keeps split files under bounded serial-size budgets', () => {
    expect(lineCount('blueprint-server.test.ts')).toBeLessThanOrEqual(400)
    expect(lineCount('blueprint-server.projects.aggregate-scope.test.ts')).toBeLessThanOrEqual(220)
    expect(lineCount('blueprint-server.projects.workspace-targeting.test.ts')).toBeLessThanOrEqual(
      220,
    )
    expect(lineCount('blueprint-server.projects.timeouts.test.ts')).toBeLessThanOrEqual(140)
    expect(lineCount('blueprint-server.list-projection.test.ts')).toBeLessThanOrEqual(160)
    expect(lineCount('blueprint-server.get-projection.test.ts')).toBeLessThanOrEqual(140)
    expect(lineCount('blueprint-server.context-projection.test.ts')).toBeLessThanOrEqual(140)
    expect(lineCount('blueprint-server.verify-idempotency.test.ts')).toBeLessThanOrEqual(320)
    expect(lineCount('blueprint-server.platform-first.task-advance.test.ts')).toBeLessThanOrEqual(
      160,
    )
    expect(lineCount('blueprint-server.platform-first.lifecycle.test.ts')).toBeLessThanOrEqual(180)
    expect(lineCount('blueprint-server.platform-first.finalize.test.ts')).toBeLessThanOrEqual(120)
    expect(lineCount('blueprint-server.platform-first.scaffold-read.test.ts')).toBeLessThanOrEqual(
      180,
    )
    expect(lineCount('blueprint-server.platform-timeouts.test.ts')).toBeLessThanOrEqual(280)
  })

  it('does not hide performance issues with in-file concurrency or oversized timeout literals', () => {
    const blueprintServerTests = readdirSync(mcpDir).filter(
      (file) =>
        file.startsWith('blueprint-server') &&
        file.endsWith('.test.ts') &&
        file !== 'blueprint-server.test-architecture.test.ts',
    )
    const inFileConcurrencyToken = 'test.' + 'concurrent'
    const oldTimeoutCapToken = '120' + '000'
    const wallClockStartToken = 'Date.' + 'now()'
    const wallClockAssertToken = 'toBeLessThan('

    for (const file of blueprintServerTests) {
      const source = readRelative(file)
      expect(
        source,
        `${file} must rely on file splitting, not ${inFileConcurrencyToken}`,
      ).not.toContain(inFileConcurrencyToken)
      expect(source, `${file} must not bake in old 120s runner caps`).not.toContain(
        oldTimeoutCapToken,
      )
      expect(
        source,
        `${file} must avoid local wall-clock flakes (${wallClockStartToken})`,
      ).not.toContain(wallClockStartToken)
      expect(
        source,
        `${file} must avoid local wall-clock budget asserts (${wallClockAssertToken})`,
      ).not.toContain(wallClockAssertToken)
    }
  })

  it('keeps read-only projection base harnesses suite-scoped instead of per-test cold starts', () => {
    const oldPattern = `
      beforeEach(async () => {
        ;({ tmpDir, tools } = await makeLazyBlueprintHarness('wp-bs-get-base-'))
      })
    `
    expect(hasLazyBlueprintHarnessBeforeEach(oldPattern)).toBe(true)

    for (const file of [
      'blueprint-server.list-projection.test.ts',
      'blueprint-server.get-projection.test.ts',
      'blueprint-server.context-projection.test.ts',
    ]) {
      expect(
        hasLazyBlueprintHarnessBeforeEach(readRelative(file)),
        `${file} must not rebuild the read-only base harness in beforeEach`,
      ).toBe(false)
    }
  })

  it('keeps the shared test harness out of production MCP modules', () => {
    const productionMcpFiles = readdirSync(mcpDir).filter(
      (file) =>
        file.endsWith('.ts') && !file.endsWith('.test.ts') && !file.endsWith('.test-harness.ts'),
    )

    for (const file of productionMcpFiles) {
      expect(readRelative(file), `${file} should not import the test harness`).not.toContain(
        'blueprint-server.test-harness',
      )
    }
  })
})
