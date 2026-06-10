import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { plugins, rules } from './index.js'
import {
  buildOxlintrc,
  OXLINT_JS_PLUGIN_FILES,
  OXLINT_PLUGIN_BASENAMES,
  STANDARD_IGNORE_PATTERNS,
} from './oxlintrc.js'
import { hasLocalOxlintConfig, sharedOxlintConfigArgs } from './shared-config-path.js'

describe('buildOxlintrc', () => {
  it('ships exactly one jsPlugin per registered plugin', () => {
    // Parity guard: if a plugin is added to index.ts but not to
    // OXLINT_PLUGIN_BASENAMES, the shared config would silently drop its rules.
    expect(OXLINT_PLUGIN_BASENAMES).toHaveLength(Object.keys(plugins).length)
  })

  it('declares jsPlugins as sibling-relative paths to the shipped json', () => {
    expect(buildOxlintrc().jsPlugins).toStrictEqual(
      OXLINT_PLUGIN_BASENAMES.map((name) => `./${name}.js`),
    )
  })

  it('carries the full rule severity map verbatim from the live config', () => {
    expect(buildOxlintrc().rules).toStrictEqual(rules)
  })

  it('ignores build output and regenerated agent-surface directories', () => {
    expect(buildOxlintrc().ignorePatterns).toStrictEqual(STANDARD_IGNORE_PATTERNS)
    // The two highest-value ignores: build output and the agent surface that
    // `wp setup` regenerates (both would otherwise flood lint with noise).
    expect(buildOxlintrc().ignorePatterns).toContain('dist')
    expect(buildOxlintrc().ignorePatterns).toContain('.claude')
  })

  it('exposes every plugin file via OXLINT_JS_PLUGIN_FILES', () => {
    expect(OXLINT_JS_PLUGIN_FILES).toStrictEqual(
      OXLINT_PLUGIN_BASENAMES.map((name) => `./${name}.js`),
    )
  })
})

describe('hasLocalOxlintConfig', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })
  function makeDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'wp-oxlint-local-'))
    dirs.push(dir)
    return dir
  }

  it('is false for a consumer with no oxlint config', () => {
    expect(hasLocalOxlintConfig(makeDir())).toBe(false)
  })

  it.each(['oxlint.config.ts', 'oxlint.config.js', '.oxlintrc.json', '.oxlintrc'])(
    'detects a local %s override',
    (filename) => {
      const dir = makeDir()
      writeFileSync(join(dir, filename), '{}\n')
      expect(hasLocalOxlintConfig(dir)).toBe(true)
    },
  )
})

describe('sharedOxlintConfigArgs', () => {
  const dirs: string[] = []
  afterEach(() => {
    for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
  })
  function makeDir(): string {
    const dir = mkdtempSync(join(tmpdir(), 'wp-oxlint-args-'))
    dirs.push(dir)
    return dir
  }

  it('does not inject when the consumer ships a local oxlint config', () => {
    const dir = makeDir()
    writeFileSync(join(dir, 'oxlint.config.ts'), 'export default {}\n')
    expect(sharedOxlintConfigArgs(dir, ['lint', '--format=json'])).toStrictEqual([])
  })

  it('does not inject when --config is already present', () => {
    expect(
      sharedOxlintConfigArgs(makeDir(), ['lint', '--config', '/some/path', '--format=json']),
    ).toStrictEqual([])
  })

  it('does not inject when -c is already present', () => {
    expect(sharedOxlintConfigArgs(makeDir(), ['lint', '-c', '/some/path'])).toStrictEqual([])
  })

  it('injects --config pointing at the generated json when present, else degrades to []', () => {
    // From the source tree the generated dist json is absent, so the function
    // degrades to [] (loud-safe: never passes a non-existent --config path).
    // The positive branch — a real --config pair pointing at an existing file —
    // is covered end-to-end against the built dist in oxlintrc.integration.test.ts.
    const result = sharedOxlintConfigArgs(makeDir(), ['lint', '--format=json'])
    if (result.length === 0) {
      expect(result).toStrictEqual([])
    } else {
      expect(result[0]).toBe('--config')
      expect(existsSync(result[1] ?? '')).toBe(true)
    }
  })
})
