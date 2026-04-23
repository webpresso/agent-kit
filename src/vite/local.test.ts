import { mkdirSync, writeFileSync } from 'node:fs'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { analyzeViteDistBundleBudget, parseBundleBudgetCliArgs } from './local.js'

const tempDirs: string[] = []

afterEach(async () => {
  await Promise.all(tempDirs.splice(0).map((dir) => rm(dir, { force: true, recursive: true })))
})

async function createDist() {
  const root = await mkdtemp(path.join(tmpdir(), 'ak-bundle-budget-'))
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
})
