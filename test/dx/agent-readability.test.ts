import { describe, expect, it } from 'vitest'

import { toWpErrorJson, createWpError } from '../../src/errors/wp-error.js'

describe('agent readability', () => {
  it('keeps machine-readable secret orchestration errors structured', () => {
    const payload = toWpErrorJson(
      createWpError({
        code: 'WP_GITHUB_BOOTSTRAP_MISSING_SECRET',
        problem: 'Missing lane secret.',
        fix: 'Export CI_SECRET_PROVIDER_TOKEN_PREVIEW before retrying.',
        docsPath: 'docs/errors/wp-secret-orchestration.md',
      }),
    )

    expect(payload).toEqual({
      ok: false,
      code: 'WP_GITHUB_BOOTSTRAP_MISSING_SECRET',
      problem: 'Missing lane secret.',
      fix: 'Export CI_SECRET_PROVIDER_TOKEN_PREVIEW before retrying.',
      docsUrl: 'docs/errors/wp-secret-orchestration.md',
    })
  })
})
