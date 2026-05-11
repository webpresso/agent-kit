import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const ROOT = import.meta.dirname
const PORTABLE_FILES = ['generated-runtime-aliases.ts', 'node.ts', 'react.ts', 'react-router.ts', 'workers.ts']
const WEBPRESSO_FILES = ['webpresso-generated-runtime-aliases.ts', 'webpresso-node.ts', 'webpresso-react.ts', 'webpresso-react-router.ts', 'webpresso-workers.ts']
const FORBIDDEN = ['.webpresso', '@webpresso/', '@webpresso\\/', '@webpresso/source']

function read(name: string): string {
  return readFileSync(join(ROOT, name), 'utf8')
}

function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '')
}

describe('export isolation', () => {
  it('keeps portable vitest exports free of Webpresso-only coupling markers', () => {
    for (const file of PORTABLE_FILES) {
      const text = stripComments(read(file))
      for (const marker of FORBIDDEN) {
        expect(text).not.toContain(marker)
      }
    }
  })

  it('contains Webpresso-only behavior only in explicit webpresso files', () => {
    const joined = WEBPRESSO_FILES.map(read).join('\n')
    expect(joined).toContain('.webpresso')
    expect(joined).toContain('@webpresso/')
  })
})
