import { describe, expect, it } from 'vitest'

import { resolveLocalPackageEntrypoint, resolveNodeRuntimeCommand } from './local-package-entrypoint.js'
import { resolveRunner } from './resolve-runner.js'

describe('resolveRunner', () => {
  it('uses RTK-filtered managed runners by default', () => {
    const vitestEntrypoint = resolveLocalPackageEntrypoint(process.cwd(), 'vitest', 'vitest.mjs')
    expect(resolveRunner('vitest')).toEqual({
      tool: 'vitest',
      command: 'rtk',
      args: [resolveNodeRuntimeCommand(), vitestEntrypoint!],
      source: 'managed',
    })
  })

  it('supports explicitly opting out of RTK filtering for managed runners', () => {
    const vitestEntrypoint = resolveLocalPackageEntrypoint(process.cwd(), 'vitest', 'vitest.mjs')
    expect(resolveRunner('vitest', { outputPolicy: 'structured' })).toEqual({
      tool: 'vitest',
      command: resolveNodeRuntimeCommand(),
      args: [vitestEntrypoint!],
      source: 'managed',
    })
  })

  it('resolves tsc through the local TypeScript entrypoint when available', () => {
    const tscEntrypoint = resolveLocalPackageEntrypoint(process.cwd(), 'typescript', 'bin/tsc')
    expect(resolveRunner('tsc', { outputPolicy: 'structured' })).toEqual({
      tool: 'tsc',
      command: resolveNodeRuntimeCommand(),
      args: [tscEntrypoint!],
      source: 'managed',
    })
  })

  it('resolves oxfmt through managed vp exec instead of a bare binary', () => {
    expect(resolveRunner('oxfmt', { outputPolicy: 'structured' })).toEqual({
      tool: 'oxfmt',
      command: 'vp',
      args: ['exec', 'oxfmt'],
      source: 'managed',
    })
  })

  it('uses the same RTK-default wrapper for fallback runners', () => {
    expect(
      resolveRunner('custom-tool', {
        fallbackCommand: 'vp',
        fallbackArgs: ['exec', 'custom-tool'],
      }),
    ).toEqual({
      tool: 'custom-tool',
      command: 'rtk',
      args: ['vp', 'exec', 'custom-tool'],
      source: 'fallback',
    })
  })

  it('supports explicit structured output for fallback runners', () => {
    expect(
      resolveRunner('custom-tool', {
        fallbackCommand: 'vp',
        fallbackArgs: ['exec', 'custom-tool'],
        outputPolicy: 'structured',
      }),
    ).toEqual({
      tool: 'custom-tool',
      command: 'vp',
      args: ['exec', 'custom-tool'],
      source: 'fallback',
    })
  })

  it('accepts legacy filterOutput false as a structured-output selector', () => {
    const tscEntrypoint = resolveLocalPackageEntrypoint(process.cwd(), 'typescript', 'bin/tsc')
    expect(resolveRunner('tsc', { filterOutput: false })).toEqual({
      tool: 'tsc',
      command: resolveNodeRuntimeCommand(),
      args: [tscEntrypoint!],
      source: 'managed',
    })
  })

})
