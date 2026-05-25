import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { baseConfig } from './index.js'
import { webpressoConfig } from './webpresso.js'

const ROOT = import.meta.dirname

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('stryker config parity', () => {
  it('keeps the canonical portable stryker base config shape', () => {
    expect(baseConfig).toMatchObject({
      packageManager: 'pnpm',
      testRunner: 'vitest',
      ignoreStatic: true,
      thresholds: { high: 85, low: 80, break: 75 },
    })
  })

  it('matches the existing Webpresso-only preset behavior', () => {
    expect(webpressoConfig).toEqual({
      ...baseConfig,
      ignorePatterns: ['/.webpresso/**'],
    })
    expect(webpressoConfig.ignorePatterns).toEqual(['/.webpresso/**'])
  })
})

describe('stryker config export isolation', () => {
  it('keeps portable stryker base free of Webpresso-only state paths', () => {
    const text = stripComments(readFileSync(join(ROOT, 'index.ts'), 'utf8'))

    expect(text).not.toContain('.webpresso')
    expect(text).not.toContain('@webpresso/')
  })

  it('keeps portable stryker base ignores for generated agent/runtime directories', () => {
    const text = readFileSync(join(ROOT, 'index.ts'), 'utf8')

    expect(text).toContain('**/.stryker-tmp/**')
    expect(text).toContain('**/.agent/**')
    expect(text).toContain('**/.agents/**')
    expect(text).toContain('**/.codex/**')
    expect(text).toContain('**/.omx/**')
    expect(text).toContain('**/dist/**')
    expect(text).toContain('**/coverage/**')
    expect(text).toContain('**/*.d.ts')
  })

  it('keeps Webpresso-only ignore behavior in the webpresso preset', () => {
    const text = readFileSync(join(ROOT, 'webpresso.ts'), 'utf8')

    expect(text).toContain('.webpresso')
  })
})
