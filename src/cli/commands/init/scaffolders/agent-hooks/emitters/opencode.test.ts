import { describe, expect, it } from 'vitest'

import { HOOK_EVENT_NAMES } from '../ir.js'
import { buildOpencodeHookPluginContent, OPENCODE_HOOK_SUPPORT_BOUNDARY } from './opencode.js'

describe('buildOpencodeHookPluginContent', () => {
  it('pins OpenCode as a degraded plugin-bridge host, not a first-class declarative host', () => {
    expect(OPENCODE_HOOK_SUPPORT_BOUNDARY).toStrictEqual({
      host: 'opencode',
      support: 'degraded',
      pluginEvents: [
        'session.created',
        'tool.execute.before',
        'tool.execute.after',
        'experimental.session.compacting',
        'shell.env',
      ],
      fullManagedEvents: ['SessionStart', 'PreToolUse', 'PostToolUse'],
      degradedNativeCallbacks: ['PermissionRequest', 'PreCompact'],
      unsupportedManagedEvents: [
        'PostToolUseFailure',
        'UserPromptSubmit',
        'Stop',
        'SubagentStart',
        'SubagentStop',
        'SessionEnd',
        'PostCompact',
      ],
      managedCommandMapping: {
        'session.created': ['wp hook sessionstart-routing'],
        'tool.execute.before': ['wp hook pretool-guard'],
        'tool.execute.after': ['wp hook post-tool'],
        'experimental.session.compacting': ['wp hook sessionstart-routing'],
      },
      degradedNotes: {
        PermissionRequest:
          'OpenCode exposes permission callbacks, but this managed bridge emits no permission hook.',
        PreCompact:
          'OpenCode experimental.session.compacting refreshes SessionStart context; no wp-precompact-snapshot command is emitted.',
      },
    })
  })

  it('classifies every canonical hook lifecycle event for OpenCode', () => {
    const classified = [
      ...OPENCODE_HOOK_SUPPORT_BOUNDARY.fullManagedEvents,
      ...OPENCODE_HOOK_SUPPORT_BOUNDARY.degradedNativeCallbacks,
      ...OPENCODE_HOOK_SUPPORT_BOUNDARY.unsupportedManagedEvents,
    ].sort()

    expect(classified).toStrictEqual([...HOOK_EVENT_NAMES].sort())
    expect(OPENCODE_HOOK_SUPPORT_BOUNDARY.degradedNativeCallbacks).toContain('PreCompact')
    expect(OPENCODE_HOOK_SUPPORT_BOUNDARY.degradedNativeCallbacks).toContain('PermissionRequest')
  })

  it('emits OpenCode lifecycle hooks for session, tool, shell env, and compaction', () => {
    const content = buildOpencodeHookPluginContent()

    expect(content).toContain('"tool.execute.before"')
    expect(content).toContain('"tool.execute.after"')
    expect(content).toContain('"shell.env"')
    expect(content).toContain("'experimental.session.compacting'")
    expect(content).toContain('CLAUDE_PROJECT_DIR')
  })

  it('contains the canonical wp hook commands for OpenCode bridging', () => {
    const content = buildOpencodeHookPluginContent()

    expect(content).toContain('wp hook sessionstart-routing')
    expect(content).toContain('wp hook pretool-guard')
    expect(content).toContain('wp hook post-tool')
    expect(content).not.toContain('wp hook guard-switch')
    expect(content).not.toContain('wp hook stop-qa')
    expect(content).not.toContain('wp hook precompact-snapshot')
  })

  it('maps OpenCode plugin lifecycle events only to supported canonical wp hooks', () => {
    expect(OPENCODE_HOOK_SUPPORT_BOUNDARY.managedCommandMapping).toStrictEqual({
      'session.created': ['wp hook sessionstart-routing'],
      'tool.execute.before': ['wp hook pretool-guard'],
      'tool.execute.after': ['wp hook post-tool'],
      'experimental.session.compacting': ['wp hook sessionstart-routing'],
    })
  })

  it('documents unsupported lifecycle paths inside the generated plugin without emitting handlers', () => {
    const content = buildOpencodeHookPluginContent()

    expect(content).toContain('Unsupported managed lifecycle events:')
    for (const event of OPENCODE_HOOK_SUPPORT_BOUNDARY.unsupportedManagedEvents) {
      expect(content).toContain(event)
    }
    expect(content).toContain('Degraded native callbacks: PermissionRequest, PreCompact')
    expect(content).not.toContain('wp hook guard-switch')
    expect(content).not.toContain('wp hook stop-qa')
    expect(content).not.toContain('wp hook precompact-snapshot')
    expect(content).not.toContain('"beforeSubmitPrompt"')
    expect(content).not.toContain('"stop"')
    expect(content).not.toContain('permission.asked')
  })
})
