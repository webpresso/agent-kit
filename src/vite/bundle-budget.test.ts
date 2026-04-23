import { describe, expect, it } from 'vitest'

import {
  analyzeBundleBudget,
  extractHtmlEagerJsReferences,
  formatBundleBudgetReport,
  formatBytes,
} from './bundle-budget.js'

describe('analyzeBundleBudget', () => {
  it('passes when generated and HTML-eager JS assets are under budget', () => {
    const result = analyzeBundleBudget({
      assets: [
        { path: 'assets/index.js', bytes: 100 },
        { path: 'assets/route.js', bytes: 200 },
      ],
      html: '<script type="module" src="/assets/index.js"></script>',
      maxHtmlEagerJsAssetBytes: 150,
      maxHtmlEagerJsTotalBytes: 150,
      maxJsAssetBytes: 250,
    })

    expect(result.ok).toBe(true)
    expect(result.htmlEagerJsAssets).toEqual([{ path: 'assets/index.js', bytes: 100 }])
    expect(result.htmlEagerJsTotalBytes).toBe(100)
  })

  it('fails when any generated JS asset exceeds the all-asset budget', () => {
    const result = analyzeBundleBudget({
      assets: [{ path: 'assets/too-large.js', bytes: 513_000 }],
      html: '',
      maxJsAssetBytes: 512_000,
    })

    expect(result.ok).toBe(false)
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        kind: 'js-asset-too-large',
        path: 'assets/too-large.js',
      }),
    )
  })

  it('fails when an HTML-eager JS asset or total exceeds its budget', () => {
    const result = analyzeBundleBudget({
      assets: [
        { path: 'assets/index.js', bytes: 300 },
        { path: 'assets/vendor.js', bytes: 200 },
      ],
      html: [
        '<link rel="modulepreload" href="/assets/vendor.js">',
        '<script type="module" src="/assets/index.js"></script>',
      ].join('\n'),
      maxHtmlEagerJsAssetBytes: 250,
      maxHtmlEagerJsTotalBytes: 400,
    })

    expect(result.ok).toBe(false)
    expect(result.violations.map((violation) => violation.kind)).toEqual([
      'html-eager-js-asset-too-large',
      'html-eager-js-total-too-large',
    ])
  })

  it('reports HTML references that are missing from generated assets', () => {
    const result = analyzeBundleBudget({
      assets: [{ path: 'assets/index.js', bytes: 100 }],
      html: '<script type="module" src="/assets/missing.js"></script>',
    })

    expect(result.ok).toBe(false)
    expect(result.violations).toContainEqual(
      expect.objectContaining({
        kind: 'html-referenced-asset-missing',
        path: 'assets/missing.js',
      }),
    )
  })

  it('uses asset size and HTML references, not generated chunk prefixes', () => {
    const result = analyzeBundleBudget({
      assets: [
        { path: 'assets/a-random-hash-name.js', bytes: 100 },
        { path: 'assets/not-a-route-name.js', bytes: 100 },
      ],
      html: '<script type="module" src="/assets/a-random-hash-name.js?v=1"></script>',
      maxJsAssetBytes: 100,
      maxHtmlEagerJsTotalBytes: 100,
    })

    expect(result.ok).toBe(true)
    expect(result.htmlEagerJsReferences).toEqual(['assets/a-random-hash-name.js'])
  })

  it('formats a readable report with violations', () => {
    const result = analyzeBundleBudget({
      assets: [{ path: 'assets/too-large.js', bytes: 2_048 }],
      maxJsAssetBytes: 1,
    })

    expect(formatBundleBudgetReport(result)).toContain('✗ Bundle budget failed')
    expect(formatBundleBudgetReport(result)).toContain('assets/too-large.js')
  })
})

describe('extractHtmlEagerJsReferences', () => {
  it('extracts module scripts and modulepreload links once', () => {
    expect(
      extractHtmlEagerJsReferences(`
        <link rel="modulepreload" href="/assets/vendor.js">
        <script type="module" src="/assets/index.js"></script>
        <script type="module" src="/assets/index.js"></script>
        <link rel="stylesheet" href="/assets/index.css">
      `),
    ).toEqual(['assets/index.js', 'assets/vendor.js'])
  })
})

describe('formatBytes', () => {
  it('formats sub-KiB values as bytes', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(512)).toBe('512 B')
    expect(formatBytes(1023)).toBe('1023 B')
  })

  it('formats KiB range with one decimal place', () => {
    expect(formatBytes(1024)).toBe('1.0 KiB')
    expect(formatBytes(1536)).toBe('1.5 KiB')
    expect(formatBytes(1024 * 512)).toBe('512.0 KiB')
  })

  it('formats MiB range with two decimal places', () => {
    expect(formatBytes(1024 * 1024)).toBe('1.00 MiB')
    expect(formatBytes(1024 * 1024 * 2.5)).toBe('2.50 MiB')
  })
})
