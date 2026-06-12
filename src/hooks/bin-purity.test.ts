/**
 * Regression test: hook bin entry points must NOT import auto-update/run.
 *
 * This is a stdio-cleanliness guard (D8/mcp). If a hook bin transitively
 * imports runUpdateFlow, it could trigger background work or stderr writes
 * from a hook that runs during MCP stdio mode, corrupting the JSON-RPC
 * transport.
 *
 * Strategy: read each bin source file and its direct imports (one level deep),
 * assert none of them import '#cli/auto-update/run' or 'auto-update/run'.
 */

import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const REPO_ROOT = resolve(import.meta.dirname, '../../')

/** Paths to the canonical hook/runtime entry-point source files (relative to REPO_ROOT). */
const HOOK_BIN_SOURCES = [
  'src/hooks/pretool-guard/index.ts',
  'src/hooks/post-tool/lint-after-edit.ts',
  'src/hooks/stop/qa-changed-files.ts',
  'src/hooks/guard-switch/index.ts',
  'src/hooks/test-quality-check.ts',
  'src/hooks/sessionstart/index.ts',
]

const AUTO_UPDATE_RUN_PATTERNS = [
  'auto-update/run',
  "from '#cli/auto-update/run",
  'from "./auto-update/run',
  "from '../auto-update/run",
]

function containsAutoUpdateRunImport(source: string): boolean {
  return AUTO_UPDATE_RUN_PATTERNS.some((pattern) => source.includes(pattern))
}

/**
 * Extract relative import paths from a TypeScript source file.
 * Matches: import ... from './foo' or '#foo/bar'
 */
function extractLocalImports(source: string): string[] {
  const matches: string[] = []
  // Match single and double quoted import paths
  const importRe = /from\s+['"]([^'"]+)['"]/g
  let m: RegExpExecArray | null
  while ((m = importRe.exec(source)) !== null) {
    const path = m[1]
    // Only follow relative imports — skip package imports and aliases for depth-1 check
    if (path !== undefined && path.startsWith('.')) {
      matches.push(path)
    }
  }
  return matches
}

/**
 * Attempt to read a source file. Returns empty string if the file does not
 * exist (e.g. a .js import resolved from a .ts source).
 */
function tryReadSource(filePath: string): string {
  const candidates = [filePath, filePath.replace(/\.js$/, '.ts')]
  for (const candidate of candidates) {
    try {
      return readFileSync(candidate, 'utf-8')
    } catch {
      // try next
    }
  }
  return ''
}

describe('hook bin purity — no auto-update/run imports', () => {
  for (const relPath of HOOK_BIN_SOURCES) {
    it(`${relPath} does not import auto-update/run (direct)`, () => {
      const absPath = join(REPO_ROOT, relPath)
      const source = readFileSync(absPath, 'utf-8')
      expect(
        containsAutoUpdateRunImport(source),
        `${relPath} directly imports auto-update/run — this corrupts MCP stdio`,
      ).toBe(false)
    })

    it(`${relPath} does not import auto-update/run (one level deep)`, () => {
      const absPath = join(REPO_ROOT, relPath)
      const source = readFileSync(absPath, 'utf-8')
      const localImports = extractLocalImports(source)
      const dir = dirname(absPath)

      for (const importPath of localImports) {
        // Resolve relative to the entry-point file's directory
        let resolved = resolve(dir, importPath)
        // Strip .js extension — the source file is .ts
        if (resolved.endsWith('.js')) {
          resolved = resolved.slice(0, -3) + '.ts'
        }
        const importedSource = tryReadSource(resolved)
        if (importedSource === '') continue

        expect(
          containsAutoUpdateRunImport(importedSource),
          `${relPath} → ${importPath} imports auto-update/run — this corrupts MCP stdio`,
        ).toBe(false)
      }
    })
  }
})
