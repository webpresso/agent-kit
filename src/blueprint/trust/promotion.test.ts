import { describe, expect, it } from 'vitest'
import { parseAllowedWpCommand } from './promotion.js'

describe('parseAllowedWpCommand', () => {
  it('accepts wp facade commands and rejects shell syntax', () => {
    expect(parseAllowedWpCommand('wp audit blueprint-lifecycle')).toEqual([
      'wp',
      'audit',
      'blueprint-lifecycle',
    ])
    expect(() => parseAllowedWpCommand('wp audit x && rm -rf .')).toThrow(/Rejected/)
    expect(() => parseAllowedWpCommand('node script.js')).toThrow(/wp facade/)
    expect(() => parseAllowedWpCommand('wp audit x --fix')).toThrow(/Rejected/)
  })
})
