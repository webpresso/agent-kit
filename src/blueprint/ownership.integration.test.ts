import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

function collectFiles(dir: string): string[] {
  const entries = readdirSync(dir, { withFileTypes: true })
  const files: string[] = []

  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...collectFiles(fullPath))
    } else if (entry.isFile()) {
      files.push(fullPath)
    }
  }

  return files
}

describe('blueprint ownership', () => {
  it(
    'does not reference schema-defs blueprint ownership in source files',
    { timeout: 15000 },
    () => {
      const srcDir = resolve(fileURLToPath(new URL('.', import.meta.url)))
      const files = collectFiles(srcDir).filter(
        (file) =>
          file.endsWith('.ts') &&
          !file.endsWith('.test.ts') &&
          !file.endsWith('.integration.test.ts'),
      )
      const forbidden = ['@myorg/schema-defs', 'schemas', 'blueprint'].join('/')

      const hits = files.filter((file) => readFileSync(file, 'utf8').includes(forbidden))

      expect(hits).toEqual([])
    },
  )
})
