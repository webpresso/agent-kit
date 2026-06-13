import { describe, expect, it } from 'vitest'

import { auditReferenceParityMatrix } from '../audit/reference-parity-matrix.js'
import { COMPILED_TOOL_REGISTRY } from '../mcp/tools/_registry.js'

const REPLACEMENT_CRITICAL_MCP_TOOLS = [
  'wp_audit',
  'wp_session_batch_execute',
  'wp_session_capture',
  'wp_session_doctor',
  'wp_session_execute',
  'wp_session_execute_file',
  'wp_session_fetch_and_index',
  'wp_session_index',
  'wp_session_purge',
  'wp_session_restore',
  'wp_session_search',
  'wp_session_snapshot',
  'wp_session_stats',
] as const

const OPEN_MCP_TOOL_GAPS = [
  {
    tool: 'wp_session_upgrade',
    status: 'open',
    reason: 'No completed handler blueprint owns this session-memory operator surface yet.',
  },
  {
    tool: 'wp_session_insight',
    status: 'open',
    reason: 'No completed handler blueprint owns this session-memory operator surface yet.',
  },
] as const

function advertisedToolNames(): string[] {
  return COMPILED_TOOL_REGISTRY.map((tool) => tool.name).sort()
}

describe('reference parity MCP tool-surface smoke', () => {
  it('advertises every completed replacement-critical MCP tool by exact public name', () => {
    const advertised = advertisedToolNames()
    const missing = REPLACEMENT_CRITICAL_MCP_TOOLS.filter((tool) => !advertised.includes(tool))
    const misadvertised = advertised.filter(
      (tool) =>
        tool.startsWith('wp_session_') && !REPLACEMENT_CRITICAL_MCP_TOOLS.includes(tool as never),
    )

    expect(missing, `missing replacement-critical MCP tools: ${missing.join(', ')}`).toEqual([])
    expect(
      misadvertised,
      `unexpected replacement-critical MCP tools: ${misadvertised.join(', ')}`,
    ).toEqual([])
  })

  it('keeps not-yet-owned operator surfaces as actionable open matrix gaps', () => {
    const advertised = advertisedToolNames()
    const incorrectlyGreen = OPEN_MCP_TOOL_GAPS.filter((gap) => advertised.includes(gap.tool))

    expect(
      incorrectlyGreen,
      `open MCP gaps were advertised as implemented: ${incorrectlyGreen.map((gap) => gap.tool).join(', ')}`,
    ).toEqual([])
    expect(OPEN_MCP_TOOL_GAPS.map((gap) => `${gap.tool}:${gap.status}`)).toEqual([
      'wp_session_upgrade:open',
      'wp_session_insight:open',
    ])
  })

  it('ties the tool discovery parity row to this smoke proof and prevents green false positives', () => {
    const result = auditReferenceParityMatrix()
    const row = result.rows.find((candidate) => candidate.capability === 'tool discovery')

    expect(row).toMatchObject({
      capability: 'tool discovery',
      proofArtifact: 'src/__integration__/reference-parity-tool-surface.integration.test.ts',
      supportLevel: 'degraded',
      status: 'open',
      requiredForRelease: true,
    })
    expect(result.releaseClaimGateReady).toBe(false)
  })
})
