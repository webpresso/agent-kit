/**
 * chmod +x every entry in package.json#bin. Reads the canonical list so
 * adding a new bin auto-extends here — no second source of truth (mirrors
 * link-self-bins.ts).
 *
 * Runs from `pnpm build`. Idempotent.
 */
import { chmodSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

interface PackageManifest {
  bin?: Record<string, string>
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8')) as PackageManifest

for (const [name, target] of Object.entries(pkg.bin ?? {})) {
  const filePath = join(repoRoot, target)
  const mode = statSync(filePath).mode
  // Set 0o755 — preserves type bits, sets rwxr-xr-x.
  chmodSync(filePath, mode | 0o111)
  console.log(`chmod +x ${target} (${name})`)
}
