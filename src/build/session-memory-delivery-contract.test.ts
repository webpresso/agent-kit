import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const repositoryRoot = process.cwd()

describe('session-memory delivery contract', () => {
  it('ships vendored ctx-rs source instead of relying on an external npm package', () => {
    const pkg = JSON.parse(readFileSync(join(repositoryRoot, 'package.json'), 'utf8')) as {
      files?: string[]
      dependencies?: Record<string, string>
    }

    expect(pkg.dependencies?.['@webpresso/ctx-rs']).toBe(undefined)
    expect(pkg.files).toContain('vendor/ctx-rs')
  })
})
