import { describe, expect, it } from 'vitest'

import {
  INSTRUCTION_SURFACE_HOSTS,
  renderInstructionSurface,
  renderSessionStartInstructionContext,
  routingToolNamesFromSource,
} from '#hooks/shared/instruction-surfaces'
import { WP_ROUTING_BLOCK, createRoutingInstructionSource } from '#hooks/shared/routing-block'

describe('instruction surface renderer', () => {
  it('renders every supported host from the shared routing source metadata', () => {
    const source = createRoutingInstructionSource()
    const tools = routingToolNamesFromSource(source.content).join(', ')

    for (const host of INSTRUCTION_SURFACE_HOSTS) {
      const surface = renderInstructionSurface({ host })

      expect(surface.content).toContain(`source="${source.name}"`)
      expect(surface.content).toContain(`<native_tool_names>${tools}</native_tool_names>`)
      expect(surface.content).not.toContain(WP_ROUTING_BLOCK)
    }
  })

  it('derives native tool names from the routing block without a second tool list', () => {
    expect(routingToolNamesFromSource(WP_ROUTING_BLOCK)).toStrictEqual([
      'wp_session_restore',
      'wp_session_search',
      'wp_session_retrieve',
      'wp_session_execute_file',
      'wp_session_execute',
      'wp_session_batch_execute',
      'wp_session_fetch_and_index',
      'wp_session_index',
      'wp_session_capture',
      'wp_session_snapshot',
      'wp_session_stats',
      'wp_session_doctor',
      'wp_session_purge',
      'wp_test',
      'wp_e2e',
      'wp_lint',
      'wp_typecheck',
      'wp_qa',
      'wp_audit',
      'wp_ci_act',
      'wp_worker_tail',
    ])
  })

  it('preserves the Claude SessionStart caller contract', () => {
    expect(renderSessionStartInstructionContext({})).toBe(WP_ROUTING_BLOCK)
    expect(
      renderSessionStartInstructionContext({
        projectRoutingMarkdown: 'project routing',
        extraSections: ['extra context'],
      }),
    ).toBe(`${WP_ROUTING_BLOCK}\n\nproject routing\n\nextra context`)
  })

  it('renders deterministic Claude instruction metadata when requested', () => {
    const surface = renderInstructionSurface({
      host: 'claude',
      projectRoutingMarkdown: 'project routing',
      includeRoutingContent: true,
    })

    const tools = routingToolNamesFromSource(WP_ROUTING_BLOCK).join(', ')

    expect(surface).toEqual({
      host: 'claude',
      artifactName: 'SessionStart.additionalContext',
      content: `<wp_instruction_surface host="claude" artifact="SessionStart.additionalContext" source="wp_routing">
  <host_contract>
    <native_tool_names>${tools}</native_tool_names>
    <stdout_noop>SessionStart always writes a JSON additionalContext envelope; an empty project routing file still emits the shared routing source.</stdout_noop>
    <lifecycle_notes>
    <note>SessionStart is context injection only and cannot block tool calls.</note>
    <note>PreToolUse remains the lifecycle for deny decisions.</note>
    </lifecycle_notes>
    <public_support>Public support: first-class Claude hook context surface.</public_support>
  </host_contract>
</wp_instruction_surface>\n\n${WP_ROUTING_BLOCK}\n\nproject routing`,
    })
  })

  it('renders Codex as an instruction-file artifact with JSON no-op wording', () => {
    const surface = renderInstructionSurface({ host: 'codex' })

    expect(surface.artifactName).toBe('AGENTS.md')
    expect(surface.content).toContain('Codex hook commands with no action write {} on stdout')
    expect(surface.content).toContain('durable guidance belongs in AGENTS.md')
    expect(surface.content).toContain('first-class Codex instruction artifact')
    expect(surface.content).toContain(
      'Unsupported managed lifecycle names are documented in the host capability matrix',
    )
  })

  it('renders Cursor command-group differences explicitly for the projected rules surface', () => {
    const surface = renderInstructionSurface({ host: 'cursor' })

    expect(surface.artifactName).toBe(
      'agent-rules/webpresso-routing.md -> .cursor/rules/webpresso-routing.mdc',
    )
    expect(surface.content).toContain('Cursor command hooks that do not need to act write {}')
    expect(surface.content).toContain('beforeSubmitPrompt is the prompt-time lifecycle')
    expect(surface.content).toContain('generated Cursor rules surface plus managed hook config')
  })

  it('renders OpenCode degraded bridge support without unscoped plugin framework wording', () => {
    const surface = renderInstructionSurface({ host: 'opencode', extraSections: ['bridge note'] })

    expect(surface.artifactName).toBe('.opencode/plugins/webpresso-hooks.js')
    expect(surface.content).toContain(
      'OpenCode plugin callbacks return without writing when there is no action',
    )
    expect(surface.content).toContain('degraded OpenCode plugin bridge')
    expect(surface.content).toContain(
      'Unsupported lifecycle callbacks stay absent unless OpenCode exposes',
    )
    expect(surface.content).toContain('bridge note')
    expect(surface.content).not.toContain('generic plugin')
    expect(surface.content).not.toContain('plugin-style')
  })
})
