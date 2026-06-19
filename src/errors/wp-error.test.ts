import { describe, expect, it } from 'vitest'

import { createWpError, formatWpError, toWpErrorJson } from './wp-error.js'

describe('WpError', () => {
  it('renders a stable JSON envelope', () => {
    expect(
      toWpErrorJson(
        createWpError({
          code: 'WP_SECRETS_DOCTOR_FAILED',
          problem: 'Secret provider check failed.',
          cause: 'preview-secret-123 leaked',
          fix: 'Run wp secrets doctor --profile preview --json',
          docsPath: 'docs/errors/wp-secret-orchestration.md',
          evidence: ['preview-secret-123'],
        }),
      ),
    ).toEqual({
      ok: false,
      code: 'WP_SECRETS_DOCTOR_FAILED',
      problem: 'Secret provider check failed.',
      cause: '[REDACTED] leaked',
      fix: 'Run wp secrets doctor --profile preview --json',
      docsUrl: 'docs/errors/wp-secret-orchestration.md',
      evidence: ['[REDACTED]'],
    })
  })

  it('formats a human-readable report', () => {
    expect(
      formatWpError(
        createWpError({
          code: 'WP_GITHUB_BOOTSTRAP_MISSING_SECRET',
          problem: 'Missing lane secret.',
          fix: 'Export CI_SECRET_PROVIDER_TOKEN_PREVIEW',
        }),
      ),
    ).toContain('WP_GITHUB_BOOTSTRAP_MISSING_SECRET')
  })
})
