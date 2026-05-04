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
    const text = stripComments(readFileSync(join(ROOT, 'stryker.base.ts'), 'utf8'))
    expect(text).not.toContain('.webpresso')
    expect(text).not.toContain('@webpresso/')
  })

  it('keeps portable stryker base hardened against common generated agent/runtime directories', () => {
    const text = readFileSync(join(ROOT, 'stryker.base.ts'), 'utf8')
    expect(text).toContain('**/.agents/**')
    expect(text).toContain('**/.agent/**')
    expect(text).toContain('**/.codex/**')
    expect(text).toContain('**/.stryker-tmp/**')
    expect(text).toContain('**/*.d.ts')
  })

  it('keeps Webpresso-only ignore behavior in the webpresso preset', () => {
    const text = readFileSync(join(ROOT, 'stryker.webpresso.ts'), 'utf8')
    expect(text).toContain('.webpresso')
  })
})
