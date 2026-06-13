import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { scaffoldPostinstallPin } from './index.js'

describe('scaffoldPostinstallPin', () => {
  let dir: string

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'wp-postinstall-pin-'))
  })

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true })
  })

  function writePkg(scripts: Record<string, string>): void {
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'test', scripts }, null, 2) + '\n')
  }

  function readPkg(): Record<string, unknown> {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as Record<string, unknown>
  }

  it('returns identical and creates no file when package.json is absent', () => {
    const result = scaffoldPostinstallPin({ repoRoot: dir, options: {} })
    expect(result.action).toStrictEqual('identical')
    // No package.json was created
    expect(() => readPkg()).toThrow()
  })

  it('adds postinstall when scripts has none', () => {
    writePkg({ build: 'tsc' })
    const result = scaffoldPostinstallPin({ repoRoot: dir, options: {} })
    expect(result.action).toStrictEqual('overwritten')
    const pkg = readPkg() as { scripts: Record<string, string> }
    expect(pkg.scripts.postinstall).toStrictEqual('wp setup')
  })

  it('chains wp setup before an existing postinstall that lacks it', () => {
    writePkg({ postinstall: 'bun scripts/sync.ts' })
    const result = scaffoldPostinstallPin({ repoRoot: dir, options: {} })
    expect(result.action).toStrictEqual('overwritten')
    const pkg = readPkg() as { scripts: Record<string, string> }
    expect(pkg.scripts.postinstall).toStrictEqual('wp setup && (bun scripts/sync.ts)')
  })

  it('is idempotent when postinstall is exactly wp setup', () => {
    writePkg({ postinstall: 'wp setup' })
    const result = scaffoldPostinstallPin({ repoRoot: dir, options: {} })
    expect(result.action).toStrictEqual('identical')
  })

  it('is idempotent when wp setup is already chained in postinstall', () => {
    writePkg({ postinstall: 'wp setup && (bun scripts/sync.ts)' })
    const result = scaffoldPostinstallPin({ repoRoot: dir, options: {} })
    expect(result.action).toStrictEqual('identical')
  })

  it('returns skipped-dry without writing in dry-run mode', () => {
    writePkg({ build: 'tsc' })
    const before = readFileSync(join(dir, 'package.json'), 'utf8')
    const result = scaffoldPostinstallPin({ repoRoot: dir, options: { dryRun: true } })
    expect(result.action).toStrictEqual('skipped-dry')
    expect(readFileSync(join(dir, 'package.json'), 'utf8')).toStrictEqual(before)
  })

  it('preserves all other scripts keys when adding postinstall', () => {
    writePkg({ build: 'tsc', test: 'vitest' })
    scaffoldPostinstallPin({ repoRoot: dir, options: {} })
    const pkg = readPkg() as { scripts: Record<string, string> }
    expect(pkg.scripts.build).toStrictEqual('tsc')
    expect(pkg.scripts.test).toStrictEqual('vitest')
  })
})
