import { readFileSync } from 'node:fs'

export type VersionPinTool = 'rtk'

export type VersionPinResult = { ok: true } | { ok: false; warning: string }

interface CompatibleVersionsPin {
  range: string
}

interface CompatibleVersions {
  pins: Record<string, CompatibleVersionsPin>
}

/**
 * Parse a semver-like version string into [major, minor, patch].
 * Strips leading 'v' and ignores pre-release/build metadata.
 * Returns null if the version string is not parseable.
 */
function parseVersion(version: string): readonly [number, number, number] | null {
  const cleaned = version.trim().replace(/^v/, '')
  const match = /^(\d+)\.(\d+)\.(\d+)/.exec(cleaned)
  if (!match) return null
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

/**
 * Minimal semver range check supporting the caret (^) operator only.
 *
 * ^X.Y.Z satisfies installed when:
 *   installed.major === range.major AND installed >= range (minor+patch)
 *
 * For ^0.Y.Z (major === 0):
 *   installed.major === 0 AND installed.minor === range.minor AND
 *   installed.patch >= range.patch
 *
 * This matches npm's caret semantics without importing a semver library.
 */
function satisfiesRange(installed: string, range: string): boolean {
  const trimmedRange = range.trim()

  if (trimmedRange.startsWith('^')) {
    const pinned = parseVersion(trimmedRange.slice(1))
    const actual = parseVersion(installed)
    if (!pinned || !actual) return false

    const [pinnedMajor, pinnedMinor, pinnedPatch] = pinned
    const [actualMajor, actualMinor, actualPatch] = actual

    if (pinnedMajor === 0) {
      // ^0.Y.Z: minor must match, patch must be >=
      if (actualMajor !== 0) return false
      if (actualMinor !== pinnedMinor) return false
      return actualPatch >= pinnedPatch
    }

    // ^X.Y.Z (X > 0): major must match, (minor, patch) must be >=
    if (actualMajor !== pinnedMajor) return false
    if (actualMinor > pinnedMinor) return true
    if (actualMinor < pinnedMinor) return false
    return actualPatch >= pinnedPatch
  }

  // Exact match fallback for bare "X.Y.Z" ranges
  const pinned = parseVersion(trimmedRange)
  const actual = parseVersion(installed)
  if (!pinned || !actual) return false
  return pinned[0] === actual[0] && pinned[1] === actual[1] && pinned[2] === actual[2]
}

/**
 * Reads compatible-versions.json and checks whether `installedVersion`
 * satisfies the pinned range for `tool`.
 *
 * @param tool             - 'rtk'
 * @param installedVersion - the version string reported by the tool binary
 * @param pinFilePath      - absolute path to compatible-versions.json; callers
 *                           should pass `join(repoRoot, 'compatible-versions.json')`
 *                           since scaffolders already have repoRoot from detectConsumer.
 */
export function checkVersionPin(
  tool: VersionPinTool,
  installedVersion: string,
  pinFilePath: string,
): VersionPinResult {
  const filePath = pinFilePath

  let pins: CompatibleVersions
  try {
    const raw = readFileSync(filePath, 'utf8')
    pins = JSON.parse(raw) as CompatibleVersions
  } catch {
    // If the pin file is missing or malformed, treat as ok (non-blocking).
    return { ok: true }
  }

  const pin = pins.pins[tool]
  if (!pin) return { ok: true }

  const range = pin.range
  if (!range) return { ok: true }

  if (satisfiesRange(installedVersion, range)) {
    return { ok: true }
  }

  return {
    ok: false,
    warning: `[webpresso] rtk version ${installedVersion} does not satisfy the required range ${range} (from compatible-versions.json). Some features may not work as expected. Update rtk to a compatible version.`,
  }
}
