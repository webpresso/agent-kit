import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

const REPO_ROOT = process.cwd()
const PACKAGE_JSON_PATH = join(REPO_ROOT, 'package.json')

describe('tooling umbrella package contract', () => {
  it('ships the tooling umbrella as scoped @webpresso/agent-kit on GitHub Packages', () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8')) as {
      name: string
      publishConfig?: { registry?: string; access?: string }
    }

    expect(pkg.name).toBe('@webpresso/agent-kit')
    expect(pkg.publishConfig).toMatchObject({
      registry: 'https://npm.pkg.github.com',
      access: 'restricted',
    })
  })

  it('exports the canonical tooling subpaths needed by external consumers', () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON_PATH, 'utf8')) as {
      exports?: Record<string, unknown>
    }
    const exports = pkg.exports ?? {}

    expect(exports).toHaveProperty('./vitest/node')
    expect(exports).toHaveProperty('./vitest/react')
    expect(exports).toHaveProperty('./vitest/workers')
    expect(exports).toHaveProperty('./tsconfig/base.json')
    expect(exports).toHaveProperty('./tsconfig/cloudflare.json')
    expect(exports).toHaveProperty('./tsconfig/react-library.json')
    expect(exports).toHaveProperty('./tsconfig/react-router.json')
    expect(exports).toHaveProperty('./stryker')
    expect(exports).toHaveProperty('./workers-test')
  })
})
