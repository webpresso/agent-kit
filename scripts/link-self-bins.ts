/**
 * Self-link the package's own `bin` entries into `node_modules/.bin/` so
 * `pnpm exec ak ...` (and bare `ak ...` inside any pnpm script) works during
 * dev in this repo. Reads the canonical list from package.json#bin, so adding
 * a new bin entry there auto-extends here — no second source of truth.
 *
 * Why this exists: pnpm symlinks bins of dependencies into node_modules/.bin
 * as part of `pnpm install`, but it does NOT self-link the current package's
 * own bin (no setting controls this). The Node.js community idiom is to do
 * the symlink in `prepare`. See pnpm exec docs (https://pnpm.io/cli/exec)
 * which describes node_modules/.bin as the dependency-bin lookup path.
 *
 * Idempotent. Runs from prepare (every `pnpm install`) and from build.
 */
import { mkdirSync, readFileSync, rmSync, symlinkSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

interface PackageManifest {
  bin?: Record<string, string>
}

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkg = JSON.parse(readFileSync(join(repoRoot, 'package.json'), 'utf-8')) as PackageManifest
const binDir = join(repoRoot, 'node_modules', '.bin')

mkdirSync(binDir, { recursive: true })

for (const [name, target] of Object.entries(pkg.bin ?? {})) {
  const link = join(binDir, name)
  const linkTarget = relative(binDir, join(repoRoot, target))
  try {
    rmSync(link, { force: true })
  } catch {
    // ignore — link didn't exist
  }
  symlinkSync(linkTarget, link)
  console.log(`linked node_modules/.bin/${name} → ${target}`)
}
