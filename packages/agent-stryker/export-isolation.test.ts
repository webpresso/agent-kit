import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = import.meta.dirname

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('export isolation', () => {
  it('keeps portable stryker base free of Webpresso-only state paths', () => {
    const text = stripComments(readFileSync(join(ROOT, 'stryker.base.mjs'), 'utf8'))
    expect(text).not.toContain('.webpresso')
    expect(text).not.toContain('@webpresso/')
  })

  it('keeps Webpresso-only ignore behavior in the webpresso preset', () => {
    const text = readFileSync(join(ROOT, 'stryker.webpresso.mjs'), 'utf8')
    expect(text).toContain('.webpresso')
  })
})
