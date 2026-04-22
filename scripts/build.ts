#!/usr/bin/env bun
import { chmod, mkdir } from 'node:fs/promises'
import { resolve } from 'node:path'

const PACKAGE_ROOT = resolve(import.meta.dirname, '..')
const DIST_DIR = resolve(PACKAGE_ROOT, 'dist')
const CLI_ENTRY = resolve(DIST_DIR, 'cli.js')

await mkdir(DIST_DIR, { recursive: true })

const result = await Bun.build({
  entrypoints: [resolve(PACKAGE_ROOT, 'src/cli/cli.ts')],
  format: 'esm',
  minify: false,
  outdir: DIST_DIR,
  sourcemap: 'linked',
  target: 'node',
})

if (!result.success) {
  for (const message of result.logs) {
    console.error(message)
  }
  process.exit(1)
}

await chmod(CLI_ENTRY, 0o755)
