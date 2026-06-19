import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const sourcePath = join(import.meta.dirname, 'native-runtime.ts')

describe('native session-memory runtime build coordination', () => {
  it('serializes cargo builds with a cross-process lock before spawning cargo', () => {
    const source = readFileSync(sourcePath, 'utf8')

    expect(source).toContain("import lockfile from 'proper-lockfile'")
    expect(source).toContain('lockfile.lockSync')
    expect(source.indexOf('lockfile.lockSync')).toBeLessThan(source.indexOf('execFileSync('))
    expect(source).toContain("join(cacheRoot, '.build.lock')")
  })

  it('uses an explicit sync lock wait loop instead of unsupported proper-lockfile retries', () => {
    const source = readFileSync(sourcePath, 'utf8')

    expect(source).toContain("code !== 'ELOCKED'")
    expect(source).toContain('sleepSync(BUILD_LOCK_POLL_MS)')
    expect(source).not.toContain('retries: {')
  })

  it('rechecks the compiled addon after acquiring the build lock', () => {
    const source = readFileSync(sourcePath, 'utf8')
    const lockedBuild = source.slice(source.indexOf('return withNativeBuildLock'))

    expect(lockedBuild).toContain('if (!shouldRebuild(nodePath, workspaceRoot)) return nodePath')
  })
})
