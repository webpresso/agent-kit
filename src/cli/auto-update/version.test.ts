import { describe, expect, it } from 'vitest'

import { compareVersions, isNewerVersion } from './version.js'

describe('auto-update version comparison', () => {
  it('compares stable semver numerically', () => {
    expect(compareVersions('2.1.1', '2.1.0')).toBeGreaterThan(0)
    expect(compareVersions('2.1.0', '2.1.1')).toBeLessThan(0)
    expect(compareVersions('2.1.0', '2.1.0')).toBe(0)
  })

  it('treats stable releases as newer than prereleases of the same version', () => {
    expect(isNewerVersion('2.1.1', '2.1.1-alpha.1')).toBe(true)
    expect(isNewerVersion('2.1.1-alpha.1', '2.1.1')).toBe(false)
  })

  it('orders prerelease identifiers according to semver precedence', () => {
    expect(compareVersions('2.1.1-alpha.2', '2.1.1-alpha.1')).toBeGreaterThan(0)
    expect(compareVersions('2.1.1-beta', '2.1.1-alpha.9')).toBeGreaterThan(0)
    expect(compareVersions('2.1.1-alpha.1', '2.1.1-alpha.beta')).toBeLessThan(0)
  })

  it('falls back deterministically when versions are not semver-like', () => {
    expect(isNewerVersion('next', 'current')).toBe('next'.localeCompare('current') > 0)
  })
})
