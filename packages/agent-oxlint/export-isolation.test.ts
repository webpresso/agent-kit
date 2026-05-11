import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

// Isolation semantics for plugin packages (non-preset):
// Plugin files are raw .js objects — no build step. Isolation means:
// (a) Each .js plugin file exports a default object/function with a valid oxlint plugin shape
//     (must have `meta.name` string and `rules` object).
// (b) No ESM imports from @webpresso/* packages (would require monorepo workspace).
// (c) No imports from @repo/* (private monorepo alias).
// (d) No require() calls to monorepo-internal packages.
// (e) Plugin meta.name strings must not reference private internal packages
//     (e.g. "@webpresso/schema-engine", "@repo/internal") — they are public-facing identifiers.
//
// This is different from preset packages (vitest-config) where isolation checks
// exported config objects for Webpresso-specific string markers.
//
// NEGATIVE TEST RATIONALE (what this test would catch):
// If a developer accidentally added:
//   import { something } from '@webpresso/schema-loaders'
// to src/import-hygiene.js, the forbidden-pattern test below would fail with:
//   "src/import-hygiene.js contains forbidden pattern: ESM import from '@webpresso/'"
// Similarly, a `require('@repo/core')` would be caught by the require() pattern.
// Plugin meta.name 'webpresso-@repo/internal-plugin' would be caught by the name check.
// These patterns are tested explicitly as positive assertions (expect(...).toBe(false))
// so any regression causes an immediate test failure rather than a silent pass.

const PLUGIN_FILES = [
  'src/import-hygiene.js',
  'src/monorepo-paths.js',
  'src/foundation-purity.js',
  'src/tier-boundaries.js',
  'src/query-patterns.js',
  'src/graphql-conventions.js',
  'src/testing-quality.js',
  'src/code-safety.js',
]

const FORBIDDEN_IMPORT_PATTERNS = [
  { pattern: /from\s+['"]@webpresso\//, label: "ESM import from '@webpresso/'" },
  { pattern: /require\s*\(\s*['"]@webpresso\//, label: "require('@webpresso/')" },
  { pattern: /from\s+['"]@repo\//, label: "ESM import from '@repo/'" },
  { pattern: /require\s*\(\s*['"]@repo\//, label: "require('@repo/')" },
]

// Plugin names must not reference private internal package namespaces.
const FORBIDDEN_PLUGIN_NAME_PATTERNS = [
  { pattern: /@webpresso\//, label: '@webpresso/ in plugin meta.name' },
  { pattern: /@repo\//, label: '@repo/ in plugin meta.name' },
]

describe('export-isolation: plugin files must not import from @webpresso/ or @repo/', () => {
  for (const file of PLUGIN_FILES) {
    it(`${file} has no monorepo-internal imports`, () => {
      const filePath = join(import.meta.dirname, file)
      const content = readFileSync(filePath, 'utf-8')

      for (const { pattern, label } of FORBIDDEN_IMPORT_PATTERNS) {
        expect(pattern.test(content), `${file} contains forbidden pattern: ${label}`).toBe(false)
      }
    })
  }
})

describe('export-isolation: plugin files must export a valid oxlint plugin shape', () => {
  // tier-boundaries uses a top-level await dynamic import (package-boundaries.js),
  // which cannot be loaded directly in this test context.
  // It is excluded from the shape check but still covered by the import-pattern test above.
  const SHAPE_TESTABLE_PLUGIN_FILES = PLUGIN_FILES.filter((f) => f !== 'src/tier-boundaries.js')

  for (const file of SHAPE_TESTABLE_PLUGIN_FILES) {
    it(`${file} default export has valid plugin shape (meta.name + rules)`, async () => {
      const filePath = join(import.meta.dirname, file)
      const mod = await import(filePath)
      const plugin = mod.default

      expect(plugin, `${file}: default export must be an object or function`).toBeTruthy()
      expect(
        typeof plugin === 'object' || typeof plugin === 'function',
        `${file}: default export must be an object or function, got ${typeof plugin}`,
      ).toBe(true)

      // Valid oxlint plugin shape: meta.name (string) + rules (object)
      expect(plugin.meta, `${file}: plugin must have a .meta property`).toBeTruthy()
      expect(typeof plugin.meta.name, `${file}: plugin.meta.name must be a string`).toBe('string')
      expect(plugin.meta.name.length > 0, `${file}: plugin.meta.name must be non-empty`).toBe(true)
      expect(plugin.rules, `${file}: plugin must have a .rules property`).toBeTruthy()
      expect(typeof plugin.rules, `${file}: plugin.rules must be an object`).toBe('object')
    })
  }
})

describe('export-isolation: plugin meta.name must not reference private packages', () => {
  const SHAPE_TESTABLE_PLUGIN_FILES = PLUGIN_FILES.filter((f) => f !== 'src/tier-boundaries.js')

  for (const file of SHAPE_TESTABLE_PLUGIN_FILES) {
    it(`${file} plugin meta.name contains no private package references`, async () => {
      const filePath = join(import.meta.dirname, file)
      const mod = await import(filePath)
      const plugin = mod.default
      const name: string = plugin?.meta?.name ?? ''

      for (const { pattern, label } of FORBIDDEN_PLUGIN_NAME_PATTERNS) {
        expect(
          pattern.test(name),
          `${file}: plugin meta.name "${name}" contains forbidden reference: ${label}`,
        ).toBe(false)
      }
    })
  }
})
