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

  it('contains the canonical wp hook bins for OpenCode bridging', () => {
    const content = buildOpencodeHookPluginContent()

    expect(content).toContain('./node_modules/.bin/wp-sessionstart-routing')
    expect(content).toContain('./node_modules/.bin/wp-check-dev-link')
    expect(content).toContain('./node_modules/.bin/wp-pretool-guard')
    expect(content).toContain('./node_modules/.bin/wp-post-tool')
  })
})
