import { describe, expect, it } from 'vitest'

import {
  createWpErrorEnvelope,
  isWpErrorCode,
  validateWpErrorDocsUrl,
} from '#errors/wp-error.js'

describe('isWpErrorCode', () => {
  it('accepts stable WP_* codes', () => {
    expect(isWpErrorCode('WP_SECRET_CONFIG_INVALID')).toBe(true)
  })

  it('rejects non-WP codes', () => {
    expect(isWpErrorCode('ERR_SECRET_CONFIG_INVALID')).toBe(false)
  })
})

describe('validateWpErrorDocsUrl', () => {
  it('accepts docs/errors markdown paths with anchors', () => {
    expect(
      validateWpErrorDocsUrl('docs/errors/wp-secret-orchestration.md#wp_secret_config_invalid'),
    ).toBe('docs/errors/wp-secret-orchestration.md#wp_secret_config_invalid')
  })

  it('rejects non-error-doc paths', () => {
    expect(() => validateWpErrorDocsUrl('docs/guides/repo-to-preview-url.md')).toThrow(
      'docsUrl must point to docs/errors/',
    )
  })
})

describe('createWpErrorEnvelope', () => {
  it('returns the stable JSON shape', () => {
    expect(
      createWpErrorEnvelope({
        code: 'WP_SECRET_CONFIG_INVALID',
        problem: 'Secret config is invalid.',
        cause: 'schemaVersion does not match the supported contract.',
        fix: 'Update the committed metadata to the supported schemaVersion.',
        docsUrl: 'docs/errors/wp-secret-orchestration.md#wp_secret_config_invalid',
        evidence: {
          file: '.webpresso/secrets.config.json',
          detail: 'schemaVersion=2',
        },
      }),
    ).toEqual({
      code: 'WP_SECRET_CONFIG_INVALID',
      problem: 'Secret config is invalid.',
      cause: 'schemaVersion does not match the supported contract.',
      fix: 'Update the committed metadata to the supported schemaVersion.',
      docsUrl: 'docs/errors/wp-secret-orchestration.md#wp_secret_config_invalid',
      evidence: {
        file: '.webpresso/secrets.config.json',
        detail: 'schemaVersion=2',
      },
      redacted: false,
    })
  })

  it('redacts secret-bearing evidence recursively', () => {
    const envelope = createWpErrorEnvelope({
      code: 'WP_SECRET_PROVIDER_FAILURE',
      problem: 'Provider bootstrap failed.',
      cause: 'The provider returned a secret-bearing error payload.',
      fix: 'Retry with a valid token after rotating the leaked credential.',
      docsUrl: 'docs/errors/wp-secret-orchestration.md#wp_secret_provider_failure',
      evidence: {
        stderr: 'token=CANARY_SECRET_123',
        nested: ['safe', 'CANARY_SECRET_123'],
      },
      redact: ['CANARY_SECRET_123'],
    })

    expect(envelope.redacted).toBe(true)
    expect(JSON.stringify(envelope.evidence)).not.toContain('CANARY_SECRET_123')
    expect(JSON.stringify(envelope.evidence)).toContain('[REDACTED]')
  })
})
