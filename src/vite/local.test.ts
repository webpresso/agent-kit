import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  analyzeViteDistBundleBudget,
  bundleBudgetCliHelp,
  parseBundleBudgetCliArgs,
  runBundleBudgetCli,
} from './local.js'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

async function createDist() {
  const root = await mkdtemp(path.join(tmpdir(), 'wp-bundle-budget-'))
  tempDirs.push(root)
  mkdirSync(path.join(root, 'assets'))
  writeFileSync(
    path.join(root, 'index.html'),
    '<script type="module" src="/assets/index.js"></script>',
  )
  writeFileSync(path.join(root, 'assets', 'index.js'), 'x'.repeat(100))
  writeFileSync(path.join(root, 'assets', 'route.js'), 'x'.repeat(200))
  return root
}

describe('analyzeViteDistBundleBudget', () => {
  it('reads a Vite dist directory and applies budgets', async () => {
    const distDir = await createDist()

    const result = analyzeViteDistBundleBudget({
      distDir,
      maxHtmlEagerJsAssetBytes: 150,
      maxHtmlEagerJsTotalBytes: 150,
      maxJsAssetBytes: 250,
    })

    expect(result.ok).toBe(true)
    expect(result.jsAssets.map((asset) => asset.path).toSorted()).toEqual([
      'assets/index.js',
      'assets/route.js',
    ])
  })
})

describe('parseBundleBudgetCliArgs', () => {
  it('parses budget flags', () => {
    expect(
      parseBundleBudgetCliArgs([
        '--dist',
        'apps/client/dist',
        '--html-entry',
        'app.html',
        '--max-js-asset-bytes',
        '512000',
        '--max-html-eager-js-asset-bytes',
        '262144',
        '--max-html-eager-js-total-bytes',
        '393216',
        '--ignore',
        'legacy',
      ]),
    ).toEqual({
      distDir: 'apps/client/dist',
      htmlEntry: 'app.html',
      ignore: ['legacy'],
      maxHtmlEagerJsAssetBytes: 262_144,
      maxHtmlEagerJsTotalBytes: 393_216,
      maxJsAssetBytes: 512_000,
    })
  })

  it('accepts a positional dist argument', () => {
    expect(parseBundleBudgetCliArgs(['my-dist'])).toMatchObject({ distDir: 'my-dist' })
  })

  it('stacks multiple --ignore values', () => {
    expect(parseBundleBudgetCliArgs(['--ignore', 'legacy', '--ignore', 'vendor'])).toMatchObject({
      ignore: ['legacy', 'vendor'],
    })
  })

  it('uses defaults for empty argv', () => {
    expect(parseBundleBudgetCliArgs([])).toEqual({
      distDir: 'dist',
      htmlEntry: 'index.html',
      ignore: [],
    })
  })

  it('throws on --help', () => {
    expect(() => parseBundleBudgetCliArgs(['--help'])).toThrow(bundleBudgetCliHelp())
    expect(() => parseBundleBudgetCliArgs(['-h'])).toThrow(bundleBudgetCliHelp())
  })

  it('throws on unknown flag', () => {
    expect(() => parseBundleBudgetCliArgs(['--unknown'])).toThrow(
      'Unknown bundle-budget option: --unknown',
    )
  })

  it('throws on missing value for a flag', () => {
    expect(() => parseBundleBudgetCliArgs(['--dist'])).toThrow('Missing value for --dist')
    expect(() => parseBundleBudgetCliArgs(['--max-js-asset-bytes'])).toThrow(
      'Missing value for --max-js-asset-bytes',
    )
  })

  it('throws on non-integer byte limit', () => {
    expect(() => parseBundleBudgetCliArgs(['--max-js-asset-bytes', 'abc'])).toThrow(
      '--max-js-asset-bytes must be a non-negative integer',
    )
  })
})

describe('runBundleBudgetCli', () => {
  it('returns 0 when dist passes all budgets', async () => {
    const distDir = await createDist()
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    try {
      const code = await runBundleBudgetCli(['--dist', distDir])
      expect(code).toBe(0)
    } finally {
      log.mockRestore()
    }
  })

  it('returns 1 when a budget is violated', async () => {
    const distDir = await createDist()
    const log = vi.spyOn(console, 'log').mockImplementation(() => undefined)
    try {
      const code = await runBundleBudgetCli(['--dist', distDir, '--max-js-asset-bytes', '1'])
      expect(code).toBe(1)
    } finally {
      log.mockRestore()
    }
  })

  it('returns 0 for --help', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const code = await runBundleBudgetCli(['--help'])
      expect(code).toBe(0)
    } finally {
      err.mockRestore()
    }
  })

  it('returns 1 on an unexpected error', async () => {
    const err = vi.spyOn(console, 'error').mockImplementation(() => undefined)
    try {
      const code = await runBundleBudgetCli(['--dist', '/nonexistent-path-xyzzy'])
      expect(code).toBe(1)
    } finally {
      err.mockRestore()
    }
  })
})
