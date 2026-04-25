import { readFileSync } from 'node:fs'
import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

async function collectTsFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true, recursive: true })
  return entries
    .filter((e) => e.isFile() && (e.name.endsWith('.ts') || e.name.endsWith('.tsx')))
    .map((e) => join(e.parentPath ?? (e as unknown as { path: string }).path, e.name))
}

describe('export isolation', () => {
  /**
   * (a) Public src/index.ts must NOT re-export anything from @webpresso/agent-kit.
   *
   * agent-kit is pinned to a GitHub SHA and is NOT published to npm. Re-exporting it
   * from the public index would make consumers fail at install time with an unresolvable dep.
   *
   * NEGATIVE TEST — what this catches:
   *   If someone adds `export * from '@webpresso/agent-kit/blueprint'` to src/index.ts,
   *   this test FAILS. Strip those re-exports; they belong inside agent-kit itself.
   */
  it('public src/index.ts does NOT re-export from @webpresso/agent-kit (readFileSync check)', () => {
    const indexPath = join(import.meta.dirname, 'src', 'index.ts')
    const content = readFileSync(indexPath, 'utf-8')

    expect(
      content,
      'src/index.ts must not re-export @webpresso/agent-kit — agent-kit is not on npm; adding it would break consumer install',
    ).not.toMatch(/@webpresso\/agent-kit/)
  })

  /**
   * (a) Broader: no file anywhere in src/ imports from @webpresso/agent-kit.
   *
   * Catches transitive leakage — e.g. a validator re-exporting agent-kit types
   * that then get re-exported from index.ts.
   */
  it('no src file imports from @webpresso/agent-kit', async () => {
    const srcDir = join(import.meta.dirname, 'src')
    const files = await collectTsFiles(srcDir)
    const violations: string[] = []

    for (const file of files) {
      const content = await readFile(file, 'utf-8')
      if (/@webpresso\/agent-kit/.test(content)) {
        violations.push(file)
      }
    }

    expect(violations, `Files importing from @webpresso/agent-kit: ${violations.join(', ')}`).toHaveLength(0)
  })

  /**
   * (b) No private monorepo @repo/ imports anywhere in src/.
   *
   * @repo/* are workspace aliases used inside the private webpresso/monorepo/ pnpm workspace.
   * They resolve to nothing outside that workspace — any such import would break consumers.
   */
  it('no src file imports from @repo/ paths', async () => {
    const srcDir = join(import.meta.dirname, 'src')
    const files = await collectTsFiles(srcDir)
    const violations: string[] = []

    for (const file of files) {
      const content = await readFile(file, 'utf-8')
      if (/@repo\//.test(content)) {
        violations.push(file)
      }
    }

    expect(violations, `Files importing from @repo/: ${violations.join(', ')}`).toHaveLength(0)
  })

  it('no src file imports from @webpresso/generated', async () => {
    const srcDir = join(import.meta.dirname, 'src')
    const files = await collectTsFiles(srcDir)
    const violations: string[] = []

    for (const file of files) {
      const content = await readFile(file, 'utf-8')
      if (/@webpresso\/generated/.test(content)) {
        violations.push(file)
      }
    }

    expect(violations, `Files importing from @webpresso/generated: ${violations.join(', ')}`).toHaveLength(0)
  })

  it('no src file uses ../../../ (monorepo-relative paths)', async () => {
    const srcDir = join(import.meta.dirname, 'src')
    const files = await collectTsFiles(srcDir)
    const violations: string[] = []

    for (const file of files) {
      const content = await readFile(file, 'utf-8')
      if (/\.\.\/\.\.\/\.\.\//.test(content)) {
        violations.push(file)
      }
    }

    expect(violations, `Files using ../../../: ${violations.join(', ')}`).toHaveLength(0)
  })

  /**
   * (c) All named exports from the built dist/index.js are defined (not undefined).
   *
   * bin entries in package.json point to dist/ — if the build is broken or a re-export
   * resolves to undefined, consumers get silent runtime failures. This test imports the
   * compiled output and asserts every export is truthy/callable.
   *
   * Covers: dist/ as the actual artifact shipped to consumers.
   */
  it('all named exports from dist/index.js are defined', async () => {
    const distIndex = join(import.meta.dirname, 'dist', 'index.js')
    // Dynamic import of the compiled output — this is what consumers actually receive.
    const mod = await import(distIndex)
    const exportedNames = Object.keys(mod)

    expect(exportedNames.length, 'dist/index.js should export at least one named export').toBeGreaterThan(0)

    const undefinedExports = exportedNames.filter((name) => mod[name] === undefined)
    expect(
      undefinedExports,
      `These exports from dist/index.js are undefined: ${undefinedExports.join(', ')}`,
    ).toHaveLength(0)
  })
})
