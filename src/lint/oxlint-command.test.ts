import { describe, expect, it } from 'vitest'

import { buildOxlintArgs, getOxlintConfigPath } from './oxlint-command.js'

describe('oxlint command helpers', () => {
  it('anchors oxlint config at the resolved repo root', () => {
    expect(getOxlintConfigPath('/repo')).toBe('/repo/oxlint.config.ts')
  })

  it('builds args with the anchored config and default dot target', () => {
    expect(buildOxlintArgs({ cwd: '/repo' })).toEqual([
      '--config',
      '/repo/oxlint.config.ts',
      '--format=json',
      '.',
    ])
  })

  it('preserves explicit files and fix mode', () => {
    expect(buildOxlintArgs({ cwd: '/repo', fix: true, files: ['a.ts', 'b.ts'] })).toEqual([
      '--config',
      '/repo/oxlint.config.ts',
      '--format=json',
      '--fix',
      'a.ts',
      'b.ts',
    ])
  })
})
