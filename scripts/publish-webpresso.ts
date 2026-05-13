#!/usr/bin/env bun
/**
 * Builds a staging directory and publishes the `webpresso` package to public npm.
 *
 * Design decisions honoured:
 *   D12 — unit + dry-run integration test coverage
 *   D15 — try/finally cleanup: staging dir is always removed
 *   D21 — registry probe for idempotent reruns: GET registry/<version> before publishing
 *
 * Usage:
 *   bun scripts/publish-webpresso.ts           # real publish
 *   bun scripts/publish-webpresso.ts --dry-run # print staging dir contents, exit 0
 */
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execSync } from 'node:child_process'

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const HOOK_BINS = [
  'ak-pretool-guard',
  'ak-post-tool',
  'ak-stop-qa',
  'ak-guard-switch',
  'ak-test-quality-check',
  'ak-sessionstart-routing',
  'ak-check-dev-link',
  'ak-restore-dev-links',
] as const

interface CanonicalPackageJson {
  version: string
  bin: Record<string, string>
  files: string[]
  [key: string]: unknown
}

/**
 * Reads and parses the canonical package.json from the repo root.
 */
export async function readCanonicalPackageJson(): Promise<CanonicalPackageJson> {
  const raw = await readFile(resolve(repoRoot, 'package.json'), 'utf8')
  return JSON.parse(raw) as CanonicalPackageJson
}

/**
 * Builds the `package.json` for the `webpresso` staging directory.
 * - name → "webpresso"
 * - publishConfig → public npmjs.org
 * - bin → { wp, webpresso, ak, ...8 hook bins }
 * - preferGlobal → true
 * All other fields are copied verbatim from the canonical package.json.
 */
export function buildStagingPackageJson(canonical: CanonicalPackageJson): Record<string, unknown> {
  const {
    name: _name,
    publishConfig: _pc,
    scripts: canonicalScripts,
    ...rest
  } = canonical as CanonicalPackageJson & { scripts?: Record<string, string> }

  const binEntries: Record<string, string> = {
    wp: './src/cli/cli.ts',
    webpresso: './src/cli/cli.ts',
    ak: './src/cli/cli.ts',
  }

  for (const hookBin of HOOK_BINS) {
    const canonicalBinPath = canonical.bin[hookBin]
    if (canonicalBinPath === undefined) {
      throw new Error(`Expected hook bin "${hookBin}" not found in canonical package.json#bin`)
    }
    binEntries[hookBin] = canonicalBinPath
  }

  // Strip postinstall — the migration notice only belongs on @webpresso/agent-kit
  // (the deprecated package), not on the new canonical webpresso public package.
  const { postinstall: _pi, ...stagingScripts } = canonicalScripts ?? {}

  return {
    ...rest,
    name: 'webpresso',
    scripts: stagingScripts,
    publishConfig: {
      registry: 'https://registry.npmjs.org',
      access: 'public',
    },
    bin: binEntries,
    preferGlobal: true,
  }
}

/**
 * D21 registry probe: returns true if the version is already published on npmjs.org.
 * Makes reruns idempotent — CI can retry the publish step safely.
 */
export async function isAlreadyPublished(version: string): Promise<boolean> {
  const url = `https://registry.npmjs.org/webpresso/${version}`
  try {
    const res = await fetch(url)
    return res.status === 200
  } catch {
    // Network error → treat as not published; let pnpm publish decide
    return false
  }
}

/**
 * Writes all staging dir contents:
 *   - package.json (swapped name + publishConfig + bin)
 *   - .npmrc (if NPM_TOKEN is set)
 *   - Copies of files[] listed in canonical package.json + README.md
 */
async function buildStagingDir(stagingDir: string, canonical: CanonicalPackageJson): Promise<void> {
  await mkdir(stagingDir, { recursive: true })

  // Write swapped package.json
  const stagingPkg = buildStagingPackageJson(canonical)
  await writeFile(
    resolve(stagingDir, 'package.json'),
    JSON.stringify(stagingPkg, null, 2) + '\n',
    'utf8',
  )

  // Write .npmrc with auth token if NPM_TOKEN is available
  if (process.env['NPM_TOKEN']) {
    await writeFile(
      resolve(stagingDir, '.npmrc'),
      '//registry.npmjs.org/:_authToken=${NPM_TOKEN}\n',
      'utf8',
    )
  }

  // Copy each file/dir listed in package.json#files
  const filesToCopy = new Set([...canonical.files, 'README.md'])
  for (const entry of filesToCopy) {
    const src = resolve(repoRoot, entry)
    const dest = resolve(stagingDir, entry)
    try {
      await cp(src, dest, { recursive: true })
    } catch (err: unknown) {
      const nodeErr = err as NodeJS.ErrnoException
      if (nodeErr.code === 'ENOENT') {
        // Skip missing optional entries (e.g. README.md may not exist in all envs)
        continue
      }
      throw err
    }
  }
}

/**
 * Prints a summary of the staging dir contents for --dry-run output.
 */
function printStagingDirSummary(stagingDir: string, version: string): void {
  console.log(`[dry-run] webpresso@${version} — staging dir: ${stagingDir}`)
  try {
    const output = execSync(`find "${stagingDir}" -maxdepth 2 -not -path '*/node_modules/*'`, {
      encoding: 'utf8',
    })
    console.log(output)
  } catch {
    console.log('(could not list staging dir contents)')
  }
}

/**
 * Main entry point.
 */
async function main(): Promise<void> {
  const isDryRun = process.argv.includes('--dry-run')
  const stagingDir = resolve(repoRoot, 'dist-publish')

  const canonical = await readCanonicalPackageJson()
  const { version } = canonical

  // D21 — registry probe: skip if already published (idempotent reruns)
  if (!isDryRun) {
    const alreadyPublished = await isAlreadyPublished(version)
    if (alreadyPublished) {
      console.log(`webpresso@${version} already published on npmjs.org — skipping`)
      process.exit(0)
    }
  }

  // D15 — try/finally: staging dir is always cleaned up
  try {
    await buildStagingDir(stagingDir, canonical)

    if (isDryRun) {
      printStagingDirSummary(stagingDir, version)
      return
    }

    // Real publish
    execSync(`pnpm publish "${stagingDir}" --no-git-checks --access public`, {
      cwd: repoRoot,
      stdio: 'inherit',
    })
    console.log(`webpresso@${version} published successfully`)
  } finally {
    await rm(stagingDir, { recursive: true, force: true })
  }
}

// Only run when executed directly (bun scripts/publish-webpresso.ts).
// When imported by tests, exports are available but main() does not fire.
if (import.meta.main) {
  await main()
}
