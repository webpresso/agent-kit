import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

type ExportEntry =
  | string
  | {
      import?: string | { default?: string; types?: string }
      default?: string
    }

type PackageManifest = {
  exports?: Record<string, ExportEntry>
}

const TSCONFIG_EXPORT_PREFIX = './tsconfig/'

export function normalizeTsconfigJsonExports(manifest: PackageManifest): PackageManifest {
  if (!manifest.exports) return manifest

  let changed = false
  const normalizedExports: Record<string, ExportEntry> = { ...manifest.exports }

  for (const [subpath, entry] of Object.entries(manifest.exports)) {
    if (!subpath.startsWith(TSCONFIG_EXPORT_PREFIX) || !subpath.endsWith('.json')) continue
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue
    if (typeof entry.default === 'string') continue

    const importDefault =
      typeof entry.import === 'string'
        ? entry.import
        : entry.import && typeof entry.import === 'object'
          ? entry.import.default
          : undefined

    if (typeof importDefault !== 'string') continue

    normalizedExports[subpath] = {
      ...entry,
      default: importDefault,
    }
    changed = true
  }

  return changed ? { ...manifest, exports: normalizedExports } : manifest
}

if (import.meta.main) {
  const packageJsonPath = join(process.cwd(), 'package.json')
  const manifest = JSON.parse(readFileSync(packageJsonPath, 'utf8')) as PackageManifest
  const normalized = normalizeTsconfigJsonExports(manifest)
  if (normalized !== manifest) {
    writeFileSync(packageJsonPath, `${JSON.stringify(normalized, null, 2)}\n`, 'utf8')
  }
}
