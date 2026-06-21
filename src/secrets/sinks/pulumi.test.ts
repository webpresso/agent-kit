import { describe, expect, it } from 'vitest'

import { buildPulumiEnvInjectionPlan } from './pulumi.js'

describe('pulumi sink', () => {
  it('stays env-injection only', () => {
    expect(
      buildPulumiEnvInjectionPlan({
        sink: 'pulumi',
        op: 'preview',
        profile: 'preview',
        provider: 'doppler',
        environment: 'stg',
        runtimeProfile: 'full',
        docsPath: 'docs/secrets/pulumi.md',
        requiresBootstrap: false,
      }),
    ).toEqual({
      sink: 'pulumi',
      mode: 'env-only',
      profile: 'preview',
    })
  })
})
