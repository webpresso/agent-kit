import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { auditNoMathRandom } from './no-math-random.js'

describe('auditNoMathRandom', () => {
  it('flags Math.random in production source', () => {
    const root = mkdtempSync(join(tmpdir(), 'wp-no-math-random-'))
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(join(root, 'src', 'unsafe.ts'), 'export const value = Math.random()\n')

    const result = auditNoMathRandom(root)

    expect(result.ok).toBe(false)
    expect(result.violations).toEqual([
      {
        file: 'src/unsafe.ts',
        message:
          'production source must use node:crypto-derived IDs instead of predictable PRNG output',
      },
    ])
  })

  it('ignores test files and passes crypto-backed production source', () => {
    const root = mkdtempSync(join(tmpdir(), 'wp-no-math-random-'))
    mkdirSync(join(root, 'src'), { recursive: true })
    writeFileSync(
      join(root, 'src', 'safe.ts'),
      "import { randomUUID } from 'node:crypto'\nrandomUUID()\n",
    )
    writeFileSync(join(root, 'src', 'safe.test.ts'), 'Math.random()\n')

    const result = auditNoMathRandom(root)

    expect(result.ok).toBe(true)
    expect(result.violations).toEqual([])
  })
})
