import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { checkVersionSkew } from './version-skew.js'

function makeTempDir(): string {
  return mkdtempSync(join(tmpdir(), 'wp-skew-test-'))
}

function writeWorkspace(dir: string, content: string): void {
  writeFileSync(join(dir, 'pnpm-workspace.yaml'), content, 'utf-8')
}

describe('checkVersionSkew', () => {
  it('returns null when versions are aligned', () => {
    const dir = makeTempDir()
    try {
      writeWorkspace(dir, `catalog:\n  '@webpresso/agent-kit': ^0.30.3\n`)
      expect(checkVersionSkew('0.30.3', dir)).toStrictEqual(null)
    } finally {
      rmSync(dir, { recursive: true })
    }
  })

  it('returns a warning when global version is ahead of pin', () => {
    const dir = makeTempDir()
    try {
      writeWorkspace(dir, `catalog:\n  '@webpresso/agent-kit': ^0.28.0\n`)
      const result = checkVersionSkew('0.30.3', dir)
      expect(result).toStrictEqual(
        '[wp] Version skew: global wp is 0.30.3 but this repo pins @webpresso/agent-kit@0.28.0 in pnpm-workspace.yaml. ' +
          'Consumer repos should depend on `@webpresso/agent-config` and use global `wp`, not keep `@webpresso/agent-kit` as a repo dependency. Remove the stale pin if this is a consumer repo, or run `vp install -g @webpresso/agent-kit@0.28.0` if this repo intentionally owns the shared wp runtime.',
      )
    } finally {
      rmSync(dir, { recursive: true })
    }
  })

  it('returns a warning when global version is behind pin', () => {
    const dir = makeTempDir()
    try {
      writeWorkspace(dir, `catalog:\n  '@webpresso/agent-kit': ^0.32.0\n`)
      const result = checkVersionSkew('0.30.3', dir)
      expect(result).not.toStrictEqual(null)
      expect(typeof result).toStrictEqual('string')
    } finally {
      rmSync(dir, { recursive: true })
    }
  })

  it('returns null when no pnpm-workspace.yaml is found', () => {
    const dir = makeTempDir()
    try {
      expect(checkVersionSkew('0.30.3', dir)).toStrictEqual(null)
    } finally {
      rmSync(dir, { recursive: true })
    }
  })

  it('returns null when catalog section is absent', () => {
    const dir = makeTempDir()
    try {
      writeWorkspace(dir, `packages:\n  - 'packages/*'\n`)
      expect(checkVersionSkew('0.30.3', dir)).toStrictEqual(null)
    } finally {
      rmSync(dir, { recursive: true })
    }
  })

  it('returns null when @webpresso/agent-kit is not in the catalog', () => {
    const dir = makeTempDir()
    try {
      writeWorkspace(dir, `catalog:\n  '@other/pkg': ^1.0.0\n`)
      expect(checkVersionSkew('0.30.3', dir)).toStrictEqual(null)
    } finally {
      rmSync(dir, { recursive: true })
    }
  })

  it('resolves pnpm-workspace.yaml from a nested subdirectory', () => {
    const dir = makeTempDir()
    try {
      writeWorkspace(dir, `catalog:\n  '@webpresso/agent-kit': ^0.28.0\n`)
      const nested = join(dir, 'packages', 'foo', 'src')
      mkdirSync(nested, { recursive: true })
      const result = checkVersionSkew('0.30.3', nested)
      expect(result).not.toStrictEqual(null)
    } finally {
      rmSync(dir, { recursive: true })
    }
  })

  it('strips tilde range prefix before comparing', () => {
    const dir = makeTempDir()
    try {
      writeWorkspace(dir, `catalog:\n  '@webpresso/agent-kit': ~0.30.3\n`)
      expect(checkVersionSkew('0.30.3', dir)).toStrictEqual(null)
    } finally {
      rmSync(dir, { recursive: true })
    }
  })
})
