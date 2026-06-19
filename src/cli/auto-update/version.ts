interface ParsedVersion {
  readonly major: number
  readonly minor: number
  readonly patch: number
  readonly prerelease: readonly (number | string)[]
}

function parseVersion(version: string): ParsedVersion | null {
  const match =
    /^v?(?<major>\d+)\.(?<minor>\d+)\.(?<patch>\d+)(?:-(?<prerelease>[0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/u.exec(
      version.trim(),
    )
  if (!match?.groups) return null

  const prerelease =
    match.groups['prerelease']?.split('.').map((part) => {
      if (/^\d+$/u.test(part)) return Number(part)
      return part
    }) ?? []

  return {
    major: Number(match.groups['major']),
    minor: Number(match.groups['minor']),
    patch: Number(match.groups['patch']),
    prerelease,
  }
}

function comparePrerelease(
  left: readonly (number | string)[],
  right: readonly (number | string)[],
): number {
  if (left.length === 0 && right.length === 0) return 0
  if (left.length === 0) return 1
  if (right.length === 0) return -1

  const len = Math.max(left.length, right.length)
  for (let i = 0; i < len; i += 1) {
    const l = left[i]
    const r = right[i]
    if (l === undefined) return -1
    if (r === undefined) return 1
    if (typeof l === 'number' && typeof r === 'number') {
      if (l !== r) return l - r
      continue
    }
    if (typeof l === 'number') return -1
    if (typeof r === 'number') return 1
    const delta = l.localeCompare(r)
    if (delta !== 0) return delta
  }

  return 0
}

export function compareVersions(left: string, right: string): number {
  const l = parseVersion(left)
  const r = parseVersion(right)
  if (l === null || r === null) return left.localeCompare(right)

  if (l.major !== r.major) return l.major - r.major
  if (l.minor !== r.minor) return l.minor - r.minor
  if (l.patch !== r.patch) return l.patch - r.patch
  return comparePrerelease(l.prerelease, r.prerelease)
}

export function isNewerVersion(latest: string, current: string): boolean {
  return compareVersions(latest, current) > 0
}
