import { describe, expect, it } from 'vitest'

import { BIN_ENTRYPOINTS, buildLaunchPlan, resolveInvokedBinName } from './_run.js'

describe('bin launcher', () => {
  it('maps known public bin names to source entrypoints', () => {
    expect(BIN_ENTRYPOINTS.wp).toBe('src/cli/cli.ts')
    expect(BIN_ENTRYPOINTS.webpresso).toBe('src/cli/cli.ts')
    expect(BIN_ENTRYPOINTS['wp-pretool-guard']).toBe('src/hooks/pretool-guard/index.ts')
    expect(BIN_ENTRYPOINTS['docs-lint']).toBe('src/config/docs-lint/cli/validate.ts')
  })

  it('prefers built dist entrypoints when available', () => {
    expect(
      buildLaunchPlan({
        binName: 'wp',
        repoRoot: '/repo',
        forwardedArgs: ['mcp'],
        builtExists: true,
        sourceExists: true,
        nodeExecPath: '/usr/bin/node',
      }),
    ).toEqual({
      mode: 'built',
      runtime: '/usr/bin/node',
      args: ['/repo/dist/esm/cli/cli.js', 'mcp'],
      entrypoint: '/repo/dist/esm/cli/cli.js',
    })
  })

  it('falls back to bun + source in a source checkout when dist is absent', () => {
    expect(
      buildLaunchPlan({
        binName: 'wp-check-dev-link',
        repoRoot: '/repo',
        forwardedArgs: [],
        builtExists: false,
        sourceExists: true,
        nodeExecPath: '/usr/bin/node',
      }),
    ).toEqual({
      mode: 'source',
      runtime: 'bun',
      args: ['/repo/src/hooks/check-dev-link/index.ts'],
      entrypoint: '/repo/src/hooks/check-dev-link/index.ts',
    })
  })

  it('throws a repair-oriented error when neither dist nor source exists', () => {
    expect(() =>
      buildLaunchPlan({
        binName: 'wp',
        repoRoot: '/repo',
        forwardedArgs: [],
        builtExists: false,
        sourceExists: false,
        nodeExecPath: '/usr/bin/node',
      }),
    ).toThrow(/wp hooks doctor/)
  })

  it('resolves the invoked bin name from the executable basename', () => {
    expect(resolveInvokedBinName(['/repo/node_modules/.bin/wp-pretool-guard'])).toBe(
      'wp-pretool-guard',
    )
    expect(resolveInvokedBinName(['/repo/bin/wp-sessionstart-routing.js'])).toBe(
      'wp-sessionstart-routing',
    )
  })
})
