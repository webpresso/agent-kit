import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { COMPILED_TOOL_REGISTRY } from './_registry.js'

describe('compiled MCP tool registry', () => {
  it('registers every non-test tool descriptor with a static import', () => {
    const toolsDir = import.meta.dirname
    const descriptorFiles = readdirSync(toolsDir)
      .filter(
        (file) =>
          file.endsWith('.ts') &&
          !file.endsWith('.test.ts') &&
          !file.startsWith('_') &&
          file !== 'index.ts',
      )
      .sort()
    const registrySource = readFileSync(join(toolsDir, '_registry.ts'), 'utf8')

    for (const file of descriptorFiles) {
      expect(registrySource).toContain(`'./${file.replace(/\.ts$/u, '.js')}'`)
    }
    expect(COMPILED_TOOL_REGISTRY.map((tool) => tool.name).sort()).toEqual([
      'wp_audit',
      'wp_audits',
      'wp_bench',
      'wp_ci_act',
      'wp_e2e',
      'wp_format',
      'wp_gain',
      'wp_lint',
      'wp_pr_status',
      'wp_qa',
      'wp_release_readiness',
      'wp_session_batch_execute',
      'wp_session_capture',
      'wp_session_doctor',
      'wp_session_execute',
      'wp_session_execute_file',
      'wp_session_fetch_and_index',
      'wp_session_index',
      'wp_session_purge',
      'wp_session_restore',
      'wp_session_retrieve',
      'wp_session_search',
      'wp_session_snapshot',
      'wp_session_stats',
      'wp_test',
      'wp_typecheck',
      'wp_worker_tail',
      'wp_worktree',
    ])
  })

  it('keeps sensitive insight and forensics tools unregistered until their privacy fixture gate exists', () => {
    const registeredNames = COMPILED_TOOL_REGISTRY.map((tool) => tool.name)

    expect(registeredNames).not.toContain('wp_repo_forensics')
    expect(registeredNames).not.toContain('wp_session_insight')
  })
})
