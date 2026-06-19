import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { REFERENCE_PARITY_COLUMNS, auditReferenceParityMatrix } from './reference-parity-matrix.js'

const EXPECTED_REFERENCE_PARITY_COLUMNS = [
  'capability',
  'host scope',
  'support level',
  'proof artifact',
  'required for release',
  'status',
] as const

const EXPECTED_REQUIRED_REFERENCE_PARITY_CAPABILITIES = [
  'lifecycle capture',
  'resume injection',
  'tool discovery',
  'indexed search',
  'routing injection',
  'pretool session redirect',
  'posttool broad capture',
  'registry/routing consistency',
  'repair path evidence',
  'host setup smoke',
  'benchmark thresholds',
  'release claim gating',
] as const

const tempDirs: string[] = []

afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true })
})

function tempRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), 'wp-reference-parity-'))
  tempDirs.push(root)
  return root
}

function write(root: string, relativePath: string, content: string): void {
  const filePath = path.join(root, relativePath)
  mkdirSync(path.dirname(filePath), { recursive: true })
  writeFileSync(filePath, content, 'utf8')
}

function seedArtifacts(root: string): void {
  const artifacts: Record<string, string> = {
    'src/session-memory/session.test.ts': 'describe SessionMemorySessionStore captureEvent restore',
    'src/hooks/sessionstart/index.test.ts': 'SessionStart WP_ROUTING_BLOCK additionalContext',
    'src/mcp/server.integration.test.ts': 'tools/list wp_session_execute wp_session_search',
    'src/session-memory/store.test.ts': 'SessionMemoryStore searchUnified restore context',
    'src/hooks/shared/routing-block.test.ts':
      '<wp_session_context> wp_session_batch_execute wp_session_execute_file',
    'src/hooks/pretool-guard/dev-routing.test.ts':
      'routeToolInputToSessionMemory wp_session_batch_execute routeCommand',
    'src/hooks/post-tool/lint-after-edit.test.ts': 'PostToolUse capturePostToolUse byte-caps',
    'src/mcp/tools/_registry.test.ts':
      'COMPILED_TOOL_REGISTRY wp_session_batch_execute wp_session_doctor',
    'src/hooks/doctor.test.ts': 'runHooksDoctor wp-pretool-guard restore',
    'src/__integration__/reference-parity-host-smoke.integration.test.ts':
      'referenceParityHostSmokeFixtures collectContinuityLifecycleProofs degraded',
    'src/cli/commands/init/host-smoke.e2e.test.ts': 'host smoke placeholder',
    'src/cli/commands/bench/session-memory.test.ts':
      'buildSessionMemoryThresholdReport search_quality_recall_at_5 dry-run',
    'docs/bench/session-memory-methodology.md': 'live measured benchmark methodology',
    'src/audit/reference-parity-claims.test.ts': 'reference-parity-matrix reference-parity release',
  }
  for (const [artifact, content] of Object.entries(artifacts)) {
    write(root, artifact, content)
  }
}

function matrix(rows: string[]): string {
  return [
    '# Reference parity matrix',
    '',
    `| ${EXPECTED_REFERENCE_PARITY_COLUMNS.join(' |')} |`,
    `| ${EXPECTED_REFERENCE_PARITY_COLUMNS.map(() => '---').join(' |')} |`,
    ...rows,
    '',
  ].join('\n')
}

function row(
  capability: string,
  artifact: string,
  options: { support?: string; required?: string; status?: string; hostScope?: string } = {},
): string {
  return [
    capability,
    options.hostScope ?? 'Claude, Codex, Cursor, OpenCode',
    options.support ?? 'full',
    artifact,
    options.required ?? 'yes',
    options.status ?? 'passed',
  ]
    .join(' | ')
    .replace(/^/u, '| ')
    .replace(/$/u, ' |')
}

function passingRows(): string[] {
  return [
    row('lifecycle capture', 'src/session-memory/session.test.ts', {
      hostScope: 'session memory store',
    }),
    row('resume injection', 'src/hooks/sessionstart/index.test.ts', {
      hostScope: 'Claude SessionStart and instruction surfaces',
    }),
    row('tool discovery', 'src/mcp/server.integration.test.ts', { hostScope: 'MCP session tools' }),
    row('indexed search', 'src/session-memory/store.test.ts', {
      hostScope: 'session memory store',
    }),
    row('routing injection', 'src/hooks/shared/routing-block.test.ts', {
      hostScope: 'Claude SessionStart and generated instruction surfaces',
    }),
    row('pretool session redirect', 'src/hooks/pretool-guard/dev-routing.test.ts', {
      hostScope: 'Claude PreToolUse',
    }),
    row('posttool broad capture', 'src/hooks/post-tool/lint-after-edit.test.ts', {
      hostScope: 'PostToolUse metadata capture',
    }),
    row('registry/routing consistency', 'src/mcp/tools/_registry.test.ts', {
      hostScope: 'MCP registry plus routing source',
    }),
    row('repair path evidence', 'src/hooks/doctor.test.ts', {
      hostScope: 'hook doctor repair path',
    }),
    row('host setup smoke', 'src/__integration__/reference-parity-host-smoke.integration.test.ts', {
      hostScope: 'Claude',
    }),
    row('benchmark thresholds', 'src/cli/commands/bench/session-memory.test.ts', {
      hostScope: 'continuity and search benchmarks',
    }),
    row('release claim gating', 'src/audit/reference-parity-claims.test.ts', {
      hostScope: 'public docs and release audits',
    }),
  ]
}

describe('auditReferenceParityMatrix', () => {
  it('requires the explicit replacement parity row schema', () => {
    expect(REFERENCE_PARITY_COLUMNS).toEqual(EXPECTED_REFERENCE_PARITY_COLUMNS)
  })

  it('fails closed when full rows exceed the canonical host capability crosswalk', () => {
    const root = tempRoot()
    seedArtifacts(root)
    write(
      root,
      'docs/bench/reference-parity-matrix.md',
      matrix(
        passingRows().map((r) =>
          r.startsWith('| lifecycle capture |')
            ? row('lifecycle capture', 'src/session-memory/session.test.ts', {
                hostScope: 'Claude, Codex, Cursor, OpenCode',
              })
            : r,
        ),
      ),
    )

    const result = auditReferenceParityMatrix(root)

    expect(result.ok).toBe(false)
    expect(result.releaseClaimGateReady).toBe(false)
    expect(result.rows.map((entry) => entry.capability)).toEqual([
      ...EXPECTED_REQUIRED_REFERENCE_PARITY_CAPABILITIES,
    ])
    expect(result.violations.map((violation) => violation.message)).toContain(
      'Replacement parity row "lifecycle capture" cannot claim full support because canonical host lifecycle support for claude, codex, cursor, opencode is degraded.',
    )
  })

  it('fails closed when a required row is missing', () => {
    const root = tempRoot()
    seedArtifacts(root)
    write(root, 'docs/bench/reference-parity-matrix.md', matrix(passingRows().slice(1)))

    const result = auditReferenceParityMatrix(root)

    expect(result.ok).toBe(false)
    expect(result.releaseClaimGateReady).toBe(false)
    expect(result.violations.map((violation) => violation.message)).toContain(
      'Missing required replacement parity row: lifecycle capture.',
    )
  })

  it('fails closed when a required proof artifact is missing', () => {
    const root = tempRoot()
    seedArtifacts(root)
    write(
      root,
      'docs/bench/reference-parity-matrix.md',
      matrix([
        row('lifecycle capture', 'src/session-memory/missing-proof.test.ts'),
        ...passingRows().slice(1),
      ]),
    )

    const result = auditReferenceParityMatrix(root)

    expect(result.ok).toBe(false)
    expect(result.violations.some((violation) => violation.message.includes('missing-proof'))).toBe(
      true,
    )
  })

  it('rejects empty placeholder test files as full passed proof', () => {
    const root = tempRoot()
    seedArtifacts(root)
    write(root, 'src/hooks/pretool-guard/dev-routing.test.ts', '')
    write(root, 'docs/bench/reference-parity-matrix.md', matrix(passingRows()))

    const result = auditReferenceParityMatrix(root)

    expect(result.ok).toBe(false)
    expect(result.violations.map((violation) => violation.message)).toContain(
      'Full passed replacement parity row "pretool session redirect" proof artifact is too weak; missing evidence marker(s): routeToolInputToSessionMemory, wp_session_batch_execute, routeCommand.',
    )
  })

  it('does not turn open or blocked required rows into green replacement parity claims', () => {
    const root = tempRoot()
    seedArtifacts(root)
    write(
      root,
      'docs/bench/reference-parity-matrix.md',
      matrix(
        passingRows().map((r) =>
          r.startsWith('| lifecycle capture |')
            ? row('lifecycle capture', 'src/session-memory/session.test.ts', {
                status: 'open',
                hostScope: 'session memory store',
              })
            : r.startsWith('| resume injection |')
              ? row('resume injection', 'src/hooks/sessionstart/index.test.ts', {
                  support: 'degraded',
                  hostScope: 'Claude SessionStart and instruction surfaces',
                })
              : r,
        ),
      ),
    )

    const result = auditReferenceParityMatrix(root)

    expect(result.ok).toBe(true)
    expect(result.releaseClaimGateReady).toBe(false)
  })

  it('fails strict release readiness while required rows remain open or degraded', () => {
    const root = tempRoot()
    seedArtifacts(root)
    write(
      root,
      'docs/bench/reference-parity-matrix.md',
      matrix(
        passingRows().map((r) =>
          r.startsWith('| lifecycle capture |')
            ? row('lifecycle capture', 'src/session-memory/session.test.ts', {
                status: 'open',
                hostScope: 'session memory store',
              })
            : r.startsWith('| resume injection |')
              ? row('resume injection', 'src/hooks/sessionstart/index.test.ts', {
                  support: 'degraded',
                  hostScope: 'Claude SessionStart and instruction surfaces',
                })
              : r,
        ),
      ),
    )

    const result = auditReferenceParityMatrix(root, undefined, { requireReleaseReady: true })

    expect(result.ok).toBe(false)
    expect(result.releaseClaimGateReady).toBe(false)
    expect(result.violations.map((violation) => violation.message)).toContain(
      'Reference parity release gate is not ready: release-required rows must be full and passed before public replacement-parity claims.',
    )
  })

  it('fails closed when a required capability opts out of release blocking', () => {
    const root = tempRoot()
    seedArtifacts(root)
    write(
      root,
      'docs/bench/reference-parity-matrix.md',
      matrix([
        row('lifecycle capture', 'src/session-memory/session.test.ts', { required: 'no' }),
        ...passingRows().slice(1),
      ]),
    )

    const result = auditReferenceParityMatrix(root)

    expect(result.ok).toBe(false)
    expect(result.releaseClaimGateReady).toBe(false)
    expect(result.violations.map((violation) => violation.message)).toContain(
      'Required replacement parity row "lifecycle capture" cannot opt out of release blocking.',
    )
  })

  it('rejects full passed replacement parity rows backed only by docs', () => {
    const root = tempRoot()
    seedArtifacts(root)
    write(
      root,
      'docs/bench/reference-parity-matrix.md',
      matrix([
        ...passingRows().slice(0, 5),
        row('benchmark thresholds', 'docs/bench/session-memory-methodology.md'),
        row('release claim gating', 'src/audit/reference-parity-claims.test.ts'),
      ]),
    )

    const result = auditReferenceParityMatrix(root)

    expect(result.ok).toBe(false)
    expect(
      result.violations.some((violation) =>
        violation.message.includes('Full passed replacement parity row "benchmark thresholds"'),
      ),
    ).toBe(true)
  })

  it('audits the repo-owned matrix document', () => {
    const result = auditReferenceParityMatrix()

    expect(result.ok).toBe(true)
    expect(result.rows.map((entry) => entry.capability)).toEqual([
      ...EXPECTED_REQUIRED_REFERENCE_PARITY_CAPABILITIES,
    ])
    expect(result.releaseClaimGateReady).toBe(false)
    expect(result.rows.find((row) => row.capability === 'benchmark thresholds')).toMatchObject({
      proofArtifact: 'docs/bench/session-memory-methodology.md',
      supportLevel: 'degraded',
      status: 'open',
    })
    expect(result.rows.find((row) => row.capability === 'host setup smoke')).toMatchObject({
      proofArtifact: 'src/__integration__/reference-parity-host-smoke.integration.test.ts',
      hostScope: 'Claude, Codex, Cursor, OpenCode',
      supportLevel: 'degraded',
      status: 'passed',
    })
  })
})
