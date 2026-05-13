import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { baseConfig as upstreamBaseConfig } from '@webpresso/agent-stryker'
import { describe, expect, it } from 'vitest'

import { baseConfig } from './index.js'
import { webpressoConfig } from './webpresso.js'

const ROOT = import.meta.dirname

function stripComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

describe('stryker config parity', () => {
  it('matches the existing portable agent-stryker base config', () => {
    expect(baseConfig).toEqual(upstreamBaseConfig)
  })

  it('matches the existing Webpresso-only preset behavior', () => {
    expect(webpressoConfig).toEqual({
      ...upstreamBaseConfig,
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
