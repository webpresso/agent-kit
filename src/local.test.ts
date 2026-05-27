import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

const repoRoot = resolve(import.meta.dirname, '..')

describe('webpresso/local public exports', () => {
  it('does not re-export legacy ci act secret-profile helpers', () => {
    const source = readFileSync(resolve(repoRoot, 'src/local.ts'), 'utf8')

    expect(source).not.toContain("from './ci/act-helper.js'")
    expect(source).not.toContain('writeTempSecretsFile')
    expect(source).not.toContain('normalizeActSecretsWithOptions')
    expect(source).not.toContain('resolveCiActSecretProfile')
  })
})
