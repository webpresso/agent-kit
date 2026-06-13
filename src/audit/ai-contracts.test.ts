import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { auditAiContracts } from './ai-contracts.js'

function write(root: string, relativePath: string, content: string): void {
  const filePath = path.join(root, relativePath)
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, content, 'utf8')
}

function seedPassingFixture(root: string): void {
  write(
    root,
    'docs/ai-reliability-contract.md',
    [
      '---',
      'type: guide',
      'title: AI Reliability Contract',
      "last_updated: '2026-05-27'",
      '---',
      '',
      '# AI Reliability Contract',
      '',
      '## Contract Rules',
    ].join('\n'),
  )
  write(
    root,
    'src/mcp/tools/_shared/result.ts',
    [
      'export function createSummaryResult(payload: unknown, options: { isError?: boolean } = {}) {',
      '  return {',
      '    structuredContent: payload,',
      '    ...(options.isError ? { isError: true } : {}),',
      '  }',
      '}',
    ].join('\n'),
  )
  write(
    root,
    'src/mcp/auto-discover.ts',
    [
      'export interface ToolHandlerResult {',
      'readonly structuredContent?: Record<string, unknown>',
      'readonly isError?: boolean',
      '}',
      'export interface ToolDescriptor {',
      'readonly outputSchema?: unknown',
      '}',
    ].join('\n'),
  )
  write(
    root,
    'src/mcp/server.integration.test.ts',
    "it('checks tools/list and structuredContent', () => { 'tools/list'; 'structuredContent' })",
  )

  for (const toolPath of [
    'src/mcp/tools/test.ts',
    'src/mcp/tools/lint.ts',
    'src/mcp/tools/typecheck.ts',
    'src/mcp/tools/qa.ts',
    'src/mcp/tools/audit.ts',
  ]) {
    write(
      root,
      toolPath,
      [
        'const outputSchema = {}',
        'const tool = { outputSchema, handler: () => createSummaryResult({}) }',
        'export default tool',
      ].join('\n'),
    )
  }

  for (const toolPath of ['src/mcp/tools/format.ts', 'src/mcp/tools/ci-act.ts']) {
    write(
      root,
      toolPath,
      ['const tool = {', '  handler: () => ({ isError: true }),', '}', 'export default tool'].join(
        '\n',
      ),
    )
  }

  write(
    root,
    'src/mcp/tools/lint.ts',
    [
      'const outputSchema = {}',
      'const tool = {',
      '  outputSchema,',
      '  handler: () => createSummaryResult({}),',
      '}',
      'const errorResult = { isError: true }',
      'export default tool',
    ].join('\n'),
  )
  write(
    root,
    'src/mcp/tools/qa.ts',
    [
      'const outputSchema = {}',
      'const tool = {',
      '  outputSchema,',
      '  handler: () => createSummaryResult({}),',
      '}',
      'const errorResult = { isError: true }',
      'export default tool',
    ].join('\n'),
  )
  write(
    root,
    'src/mcp/tools/audit.ts',
    [
      'const outputSchema = {}',
      'const tool = {',
      '  outputSchema,',
      '  handler: () => createSummaryResult({}),',
      '}',
      'const errorResult = { isError: true }',
      'export default tool',
    ].join('\n'),
  )

  const referenceEvidence = [
    'docs/bench/reference-parity-matrix.md',
    'src/__integration__/reference-parity-host-smoke.test.ts',
    'src/__integration__/reference-parity-tool-surface.test.ts',
    'docs/bench/session-memory-methodology.md',
  ]
  const claimGateText = ['Release claims are gated by:', ...referenceEvidence].join('\n')
  write(root, 'README.md', claimGateText)
  write(root, 'CHANGELOG.md', ['# Changelog', '', '## Unreleased', '', claimGateText].join('\n'))
  write(
    root,
    'docs/bench/reference-parity-matrix.md',
    [
      '| capability | host scope | support level | proof artifact | required for release | status |',
      '| --- | --- | --- | --- | --- | --- |',
      '| lifecycle capture | session memory store | full | src/session-memory/session.test.ts | yes | passed |',
      '| resume injection | Claude, Codex, Cursor, OpenCode | degraded | src/hooks/sessionstart/index.test.ts | yes | open |',
      '| tool discovery | MCP session tools | degraded | src/__integration__/reference-parity-tool-surface.test.ts | yes | open |',
      '| indexed search | session memory store | full | src/session-memory/store.test.ts | yes | passed |',
      '| host setup smoke | Claude, Codex, Cursor, OpenCode | degraded | src/__integration__/reference-parity-host-smoke.test.ts | yes | passed |',
      '| benchmark thresholds | continuity and search benchmarks | degraded | docs/bench/session-memory-methodology.md | yes | open |',
      '| release claim gating | public docs and release audits | degraded | src/audit/reference-parity-claims.test.ts | yes | open |',
    ].join('\n'),
  )
  for (const artifact of [
    'src/session-memory/session.test.ts',
    'src/hooks/sessionstart/index.test.ts',
    'src/__integration__/reference-parity-tool-surface.test.ts',
    'src/session-memory/store.test.ts',
    'src/__integration__/reference-parity-host-smoke.test.ts',
    'docs/bench/session-memory-methodology.md',
    'src/audit/reference-parity-claims.test.ts',
  ]) {
    write(root, artifact, 'proof')
  }
}

describe('auditAiContracts', () => {
  const tempDirs: string[] = []

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('passes when the canonical contract surfaces are present', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'wp-ai-contracts-'))
    tempDirs.push(root)
    seedPassingFixture(root)

    const result = auditAiContracts(root)

    expect(result.ok).toBe(true)
    expect(result.title).toBe('AI contracts audit')
    expect(result.violations).toEqual([])
  })

  it('fails when the contract doc is missing', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'wp-ai-contracts-'))
    tempDirs.push(root)
    seedPassingFixture(root)
    rmSync(path.join(root, 'docs'), { recursive: true, force: true })

    const result = auditAiContracts(root)

    expect(result.ok).toBe(false)
    expect(result.violations.some((v) => v.file === 'docs/ai-reliability-contract.md')).toBe(true)
  })

  it('fails when a core wp tool omits outputSchema from the default export surface', () => {
    const root = mkdtempSync(path.join(os.tmpdir(), 'wp-ai-contracts-'))
    tempDirs.push(root)
    seedPassingFixture(root)
    write(
      root,
      'src/mcp/tools/lint.ts',
      [
        'const tool = { handler: () => createSummaryResult({}) }',
        'const errorResult = { isError: true }',
        'export default tool',
      ].join('\n'),
    )

    const result = auditAiContracts(root)

    expect(result.ok).toBe(false)
    expect(
      result.violations.some(
        (v) => v.file === 'src/mcp/tools/lint.ts' && v.message.includes('outputSchema'),
      ),
    ).toBe(true)
  })
})
