import { describe, expect, it } from 'vitest'

import {
  detectWrappedWpCommand,
  detectWrappedWpRuntimeInvocation,
  formatWrappedWpInvocationError,
  wrappedWpGuidanceForArgs,
} from './wrapped-wp.js'

describe('detectWrappedWpCommand', () => {
  it('detects run-script wrappers around wp', () => {
    expect(detectWrappedWpCommand('pnpm run wp test src/foo.test.ts')).toStrictEqual({
      manager: 'pnpm',
      wpArgs: ['test', 'src/foo.test.ts'],
    })
    expect(detectWrappedWpCommand('bun run wp lint')).toStrictEqual({
      manager: 'bun',
      wpArgs: ['lint'],
    })
    expect(detectWrappedWpCommand('corepack pnpm run wp audit package-surface')).toStrictEqual({
      manager: 'pnpm',
      wpArgs: ['audit', 'package-surface'],
    })
  })

  it('detects shorthand script wrappers around wp', () => {
    expect(detectWrappedWpCommand('yarn wp setup')).toStrictEqual({
      manager: 'yarn',
      wpArgs: ['setup'],
    })
    expect(detectWrappedWpCommand('pnpm wp typecheck')).toStrictEqual({
      manager: 'pnpm',
      wpArgs: ['typecheck'],
    })
  })

  it('does not flag direct wp or npm exec one-shot installs', () => {
    expect(detectWrappedWpCommand('wp test')).toBeNull()
    expect(
      detectWrappedWpCommand('npm exec --yes --package @webpresso/agent-kit@latest -- wp setup'),
    ).toBeNull()
  })
})

describe('wrappedWpGuidanceForArgs', () => {
  it('maps dev-workflow verbs to the matching MCP tool', () => {
    expect(wrappedWpGuidanceForArgs(['test']).tool).toBe('wp_test')
    expect(wrappedWpGuidanceForArgs(['audit', 'docs-frontmatter']).tool).toBe('wp_audit')
    expect(wrappedWpGuidanceForArgs(['setup']).tool).toBe('wp')
  })
})

describe('detectWrappedWpRuntimeInvocation', () => {
  it('detects npm lifecycle wrapper invocation for the wp script', () => {
    const wrapped = detectWrappedWpRuntimeInvocation({
      argv: ['node', '/repo/bin/wp', 'test'],
      env: {
        npm_lifecycle_event: 'wp',
        npm_execpath: '/opt/homebrew/lib/node_modules/pnpm/bin/pnpm.cjs',
      },
      platform: 'linux',
    })

    expect(wrapped).toStrictEqual({
      manager: 'pnpm',
      wpArgs: ['test'],
    })
  })

  it('detects wrapper invocation from the ancestor process chain', () => {
    const wrapped = detectWrappedWpRuntimeInvocation({
      argv: ['node', '/repo/bin/wp', 'setup'],
      env: {},
      platform: 'linux',
      ppid: 20,
      readProcessInfo: (pid) => {
        if (pid === 20) return { ppid: 10, command: '/bin/sh -c node ./node_modules/.bin/wp' }
        if (pid === 10) return { ppid: 1, command: 'vp run wp -- setup' }
        return null
      },
    })

    expect(wrapped).toStrictEqual({
      manager: 'vp',
      wpArgs: ['setup'],
    })
  })

  it('formats the corrective runtime error deterministically', () => {
    const message = formatWrappedWpInvocationError(
      { manager: 'bun', wpArgs: ['test'] },
      ['node', '/repo/bin/wp', 'test'],
    )

    expect(message).toContain('webpresso package-manager wrapper invocation is forbidden')
    expect(message).toContain('Use wp_test MCP tool when available')
    expect(message).toContain('run direct `wp test`')
    expect(message).toContain('bun run wp')
  })
})
