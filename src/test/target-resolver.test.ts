import { describe, expect, it } from 'vitest'

import { looksLikeTestFilePath, resolveTestTarget } from './target-resolver.js'

describe('looksLikeTestFilePath', () => {
  it('recognizes paths with slashes as file targets', () => {
    expect(looksLikeTestFilePath('packages/example/src/index.ts')).toBe(true)
  })

  it('recognizes bare test file extensions as file targets', () => {
    expect(looksLikeTestFilePath('index.test.ts')).toBe(true)
  })

  it('does not consider bare names without slashes or extensions as files', () => {
    expect(looksLikeTestFilePath('agent-kit')).toBe(false)
  })

  it('recognizes files with .spec.tsx extension', () => {
    expect(looksLikeTestFilePath('test.spec.tsx')).toBe(true)
  })

  it('recognizes files with .mts extension', () => {
    expect(looksLikeTestFilePath('module.mts')).toBe(true)
  })

  it('recognizes files with .cjs extension', () => {
    expect(looksLikeTestFilePath('commonjs.cjs')).toBe(true)
  })

  it('recognizes files with .test.js extension', () => {
    expect(looksLikeTestFilePath('something.test.js')).toBe(true)
  })
})

describe('resolveTestTarget', () => {
  it('resolves package targets to vp filters', () => {
    expect(resolveTestTarget({ package: ['cli2', '@scope/tool'] })).toEqual({
      type: 'package',
      values: ['cli2', '@scope/tool'],
    })
  })

  it('resolves file targets to direct file paths', () => {
    expect(resolveTestTarget({ file: ['apps/cli2/src/commands/target.test.ts'] })).toEqual({
      type: 'file',
      values: ['apps/cli2/src/commands/target.test.ts'],
    })
  })

  it('infers file targets from path-like positional input', () => {
    expect(resolveTestTarget({ positional: ['packages/example/src/index.test.ts'] })).toEqual({
      type: 'file',
      values: ['packages/example/src/index.test.ts'],
    })
  })

  it('infers package targets from non-file positional input', () => {
    expect(resolveTestTarget({ positional: ['agent-kit'] })).toEqual({
      type: 'package',
      values: ['agent-kit'],
    })
  })

  it('defaults to all when no target is supplied', () => {
    expect(resolveTestTarget({})).toEqual({ type: 'all', values: [] })
  })

  it('rejects mixed package and file targets', () => {
    expect(() =>
      resolveTestTarget({
        package: ['cli2'],
        file: ['apps/cli2/src/commands/target.test.ts'],
      }),
    ).toThrow(/Choose package targets or file targets/)
  })

  it('rejects mixed positional targets (file + package)', () => {
    expect(() =>
      resolveTestTarget({
        positional: ['packages/example/src/index.test.ts', 'agent-kit'],
      }),
    ).toThrow(/Choose package targets or file targets/)
  })

  it('trims whitespace from target values', () => {
    expect(resolveTestTarget({ package: ['  agent-kit  '] })).toEqual({
      type: 'package',
      values: ['agent-kit'],
    })
  })

  it('infers package when positional targets lack file characteristics', () => {
    expect(resolveTestTarget({ positional: ['cli2', 'agent-kit'] })).toEqual({
      type: 'package',
      values: ['cli2', 'agent-kit'],
    })
  })
})
