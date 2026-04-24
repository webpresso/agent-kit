import { describe, expect, it } from 'vitest'

import { createAkE2eCommandConfig, E2E_COMMAND_HELP } from './e2e.js'

describe('ak e2e command helpers', () => {
  it('documents the generic E2E flag surface', () => {
    expect(E2E_COMMAND_HELP).toContain('ak e2e --suite smoke')
    expect(E2E_COMMAND_HELP).toContain('--test-list')
    expect(E2E_COMMAND_HELP).toContain('--reuse-reset')
  })

  it('builds a Playwright command from generic flags', () => {
    expect(
      createAkE2eCommandConfig({
        suite: 'smoke',
        config: 'playwright.config.ts',
        file: ['tests/smoke.spec.ts'],
        headed: true,
        workers: '2',
        testList: '.tmp/e2e-list.txt',
      }),
    ).toEqual({
      command: 'pnpm',
      args: [
        'exec',
        'playwright',
        'test',
        '--config',
        'playwright.config.ts',
        '--headed',
        '--workers',
        '2',
        '--test-list',
        '.tmp/e2e-list.txt',
        'tests/smoke.spec.ts',
      ],
    })
  })
})
