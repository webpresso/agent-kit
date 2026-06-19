import { promises as fs } from 'node:fs'
import { join } from 'node:path'

export type ClaimSurface = {
  readonly path: string
  readonly text: string
}

async function readOptional(filePath: string): Promise<ClaimSurface | null> {
  try {
    const text = await fs.readFile(filePath, 'utf8')
    return { path: filePath, text }
  } catch {
    return null
  }
}

async function readFirstLines(filePath: string, lineCount: number): Promise<ClaimSurface | null> {
  try {
    const text = await fs.readFile(filePath, 'utf8')
    const lines = text.split('\n').slice(0, lineCount).join('\n')
    return { path: filePath, text: lines }
  } catch {
    return null
  }
}

async function collectMarkdownUnder(dir: string, exclude: string): Promise<ClaimSurface[]> {
  const results: ClaimSurface[] = []
  let entries: Awaited<ReturnType<typeof fs.readdir>>
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return results
  }
  for (const entry of entries) {
    const fullPath = join(dir, entry.name)
    if (entry.isDirectory()) {
      if (fullPath === exclude) continue
      const nested = await collectMarkdownUnder(fullPath, exclude)
      results.push(...nested)
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      const surface = await readOptional(fullPath)
      if (surface !== null) results.push(surface)
    }
  }
  return results
}

async function packedFilePaths(repoRoot: string): Promise<string[]> {
  const { spawnSync } = await import('node:child_process')
  const result = spawnSync('npm', ['pack', '--dry-run', '--json'], {
    cwd: repoRoot,
    encoding: 'utf8',
  })
  if (result.status !== 0) return []
  try {
    const parsed: unknown = JSON.parse(result.stdout)
    if (!Array.isArray(parsed) || parsed.length === 0) return []
    const first: unknown = parsed[0]
    if (
      typeof first !== 'object' ||
      first === null ||
      !('files' in first) ||
      !Array.isArray((first as Record<string, unknown>).files)
    ) {
      return []
    }
    return (first as { files: { path: string }[] }).files
      .map((f) => f.path)
      .filter((p): p is string => typeof p === 'string')
  } catch {
    return []
  }
}

/**
 * Returns all claim surfaces for scanning.
 * Excludes docs/research/** (external comparison material, not scanned for claims).
 * Includes: working-tree markdown, package.json, latest CHANGELOG slice,
 *           packed tarball entries (via npm pack --dry-run JSON output),
 *           CLI source strings (scripts/bench/README.md, scripts/bench/PREFLIGHT.md if they exist)
 */
export async function enumerateClaimSurfaces(repoRoot: string): Promise<readonly ClaimSurface[]> {
  const surfaces: ClaimSurface[] = []

  const rootFiles = [
    join(repoRoot, 'README.md'),
    join(repoRoot, 'package.json'),
    join(repoRoot, 'scripts', 'bench', 'README.md'),
    join(repoRoot, 'scripts', 'bench', 'PREFLIGHT.md'),
  ]
  const rootResults = await Promise.all(rootFiles.map(readOptional))
  for (const s of rootResults) {
    if (s !== null) surfaces.push(s)
  }

  const changelogSurface = await readFirstLines(join(repoRoot, 'CHANGELOG.md'), 50)
  if (changelogSurface !== null) surfaces.push(changelogSurface)

  const docsDir = join(repoRoot, 'docs')
  const excludeResearch = join(repoRoot, 'docs', 'research')
  const docsSurfaces = await collectMarkdownUnder(docsDir, excludeResearch)
  surfaces.push(...docsSurfaces)

  const packedPaths = await packedFilePaths(repoRoot)
  const packedSurfaces = await Promise.all(
    packedPaths.map((p) => readOptional(join(repoRoot, p))),
  )
  for (const s of packedSurfaces) {
    if (s !== null && !surfaces.some((existing) => existing.path === s.path)) {
      surfaces.push(s)
    }
  }

  return surfaces
}
