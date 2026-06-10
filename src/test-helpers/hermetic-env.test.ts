import { describe, expect, it } from 'vitest'
import { LEAKY_ENV_KEYS, resetLeakyEnv } from './hermetic-env.js'

/**
 * Regression guard for the hermetic-env setup file wired via
 * `vitest.config.ts#setupFiles`. If the reset is removed or a key is dropped,
 * agent-session env vars leak back into the test process and re-break the
 * blueprint-server suite (see docs/research/2026-05-27-mcp-vitest-test-architecture-risks.md).
 *
 * These assertions are environment-agnostic on purpose: they set the vars
 * themselves and prove `resetLeakyEnv` removes them, so the guard fails even in
 * CI (where `CLAUDE_PROJECT_DIR` is normally unset and a naive presence check
 * would false-pass).
 */
describe('hermetic-env', () => {
  it('locks the exact set of agent-session vars that must be reset', () => {
    expect([...LEAKY_ENV_KEYS]).toStrictEqual([
      'CLAUDE_PROJECT_DIR',
      'WP_SKIP_UPDATE_CHECK',
      'WP_BLUEPRINT_ROOTS_TIMEOUT_MS',
      'WP_BLUEPRINT_PROJECT_DISCOVERY_TIMEOUT_MS',
      'WP_BLUEPRINT_PLATFORM_DISABLED',
      'GITHUB_PAT',
      'QUALITY_ENGINE_COMPACT',
    ])
  })

  it('deletes every leaky var from process.env', () => {
    for (const key of LEAKY_ENV_KEYS) {
      process.env[key] = 'leaked-from-agent-session'
    }

    resetLeakyEnv()

    for (const key of LEAKY_ENV_KEYS) {
      expect(key in process.env).toBe(false)
    }
  })
})
