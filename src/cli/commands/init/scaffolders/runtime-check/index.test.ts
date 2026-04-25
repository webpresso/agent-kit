import { describe, expect, it } from 'vitest'

import { checkRuntimes, type RuntimeProbe } from './index.js'

describe('checkRuntimes', () => {
  it('reports detected versions and missing tools side-by-side', () => {
    const probes: RuntimeProbe[] = [
      { name: 'always-found', detect: () => '1.2.3', hint: 'noop' },
      { name: 'never-found', detect: () => null, hint: 'install via X' },
    ]
    const result = checkRuntimes(probes)
    expect(result).toEqual([
      { name: 'always-found', version: '1.2.3', hint: 'noop' },
      { name: 'never-found', version: null, hint: 'install via X' },
    ])
  })

  it('preserves probe order in output', () => {
    const probes: RuntimeProbe[] = [
      { name: 'a', detect: () => 'va', hint: '' },
      { name: 'b', detect: () => 'vb', hint: '' },
      { name: 'c', detect: () => 'vc', hint: '' },
    ]
    expect(checkRuntimes(probes).map((s) => s.name)).toEqual(['a', 'b', 'c'])
  })
})
