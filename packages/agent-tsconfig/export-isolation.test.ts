import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = import.meta.dirname

describe('export isolation', () => {
  it('keeps portable base config free of Webpresso-only conditions', () => {
    const text = readFileSync(join(ROOT, 'base.json'), 'utf8')
    expect(text).not.toContain('@webpresso/source')
    expect(text).not.toContain('.webpresso')
  })

  it('keeps Webpresso-only customConditions in webpresso.json', () => {
    const text = readFileSync(join(ROOT, 'webpresso.json'), 'utf8')
    expect(text).toContain('@webpresso/source')
  })
})
