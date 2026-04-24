import { describe, expect, it } from 'vitest'

import {
  AgentKitConfigValidationError,
  defineAgentKitConfig,
  validateAgentKitConfig,
} from './config.js'

describe('defineAgentKitConfig', () => {
  it('returns the config unchanged', () => {
    const config = defineAgentKitConfig({
      e2e: {
        hostAdapterModule: './apps/e2e/src/agent-kit-host-adapter.ts',
      },
    })

    expect(config).toEqual({
      e2e: {
        hostAdapterModule: './apps/e2e/src/agent-kit-host-adapter.ts',
      },
    })
  })
})

describe('validateAgentKitConfig', () => {
  it('accepts a root config without e2e settings', () => {
    expect(validateAgentKitConfig({}, '/repo/agent-kit.config.ts')).toEqual({})
  })

  it('rejects invalid e2e config payloads', () => {
    expect(() =>
      validateAgentKitConfig(
        {
          e2e: {
            hostAdapterExport: 'agentKitE2eHostAdapter',
          },
        },
        '/repo/agent-kit.config.ts',
      ),
    ).toThrow(AgentKitConfigValidationError)
  })
})
