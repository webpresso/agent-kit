import { describe, expect, it } from 'vitest'

import { buildOpencodeHookPluginContent } from './opencode.js'

describe('buildOpencodeHookPluginContent', () => {
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
  })
})
