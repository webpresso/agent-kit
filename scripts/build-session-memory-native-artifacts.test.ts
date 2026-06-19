import { describe, expect, it } from 'vitest'

import { buildSessionMemoryNativeCompileOperation } from './build-session-memory-native-artifacts.js'

describe('build-session-memory-native-artifacts', () => {
  it('builds the host NAPI addon and stages it under the target-specific dist path', () => {
    const operation = buildSessionMemoryNativeCompileOperation({ rootDir: '/repo' })

    expect(operation.target.id).toBe(`${process.platform}-${process.arch}`)
    expect(operation.args).toEqual([
      'build',
      '--manifest-path',
      '/repo/native/session-memory-engine/Cargo.toml',
      '--package',
      'session-memory-napi',
      '--release',
      '--locked',
    ])
    expect(operation.addonDestination).toBe(
      `/repo/dist/session-memory-native/${process.platform}-${process.arch}/session_memory_napi.node`,
    )
  })

  it('refuses non-host cross-target builds instead of pretending to cross-compile', () => {
    const nonHost =
      process.platform === 'linux' && process.arch === 'x64' ? 'darwin-arm64' : 'linux-x64'

    expect(() =>
      buildSessionMemoryNativeCompileOperation({ rootDir: '/repo', selectedTarget: nonHost }),
    ).toThrow(/Cannot build session-memory native target/u)
  })
})
