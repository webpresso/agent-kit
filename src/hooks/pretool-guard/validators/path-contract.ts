export const BLUEPRINTS_ROOT = 'webpresso/blueprints'
const DEFAULT_BLUEPRINTS_ROOT = 'blueprints'
export const TECH_DEBT_ROOT = 'webpresso/tech-debt'
const DEFAULT_TECH_DEBT_ROOT = 'tech-debt'
const BLUEPRINT_STATUSES = new Set([
  'draft',
  'planned',
  'parked',
  'in-progress',
  'completed',
  'archived',
])
const KEBAB_CASE_SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

// Both canonical blueprint-root layouts accepted by default.
const CANONICAL_BLUEPRINTS_ROOTS = [BLUEPRINTS_ROOT, DEFAULT_BLUEPRINTS_ROOT] as const
const CANONICAL_TECH_DEBT_ROOTS = [TECH_DEBT_ROOT, DEFAULT_TECH_DEBT_ROOT] as const

function normalizePlanningPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\//, '')
}

function matchesRoot(normalized: string, root: string): boolean {
  return normalized === root || normalized.startsWith(`${root}/`)
}

/**
 * Returns true if the path is under any accepted blueprints root.
 * Pass `blueprintsRoot` to restrict to a single configured root.
 */
export function isBlueprintPath(filePath: string, blueprintsRoot?: string): boolean {
  const normalized = normalizePlanningPath(filePath)
  if (blueprintsRoot !== undefined) return matchesRoot(normalized, blueprintsRoot)
  return CANONICAL_BLUEPRINTS_ROOTS.some((root) => matchesRoot(normalized, root))
}

export function getNonCanonicalPlanningPathViolation(
  filePath: string,
  blueprintsRoot?: string,
  techDebtRoot?: string,
): string | null {
  const normalized = normalizePlanningPath(filePath)

  const bpRoots = blueprintsRoot ? [blueprintsRoot] : CANONICAL_BLUEPRINTS_ROOTS
  const tdRoots = techDebtRoot ? [techDebtRoot] : CANONICAL_TECH_DEBT_ROOTS

  if (
    bpRoots.some((r) => matchesRoot(normalized, r)) ||
    tdRoots.some((r) => matchesRoot(normalized, r))
  ) {
    return null
  }

  if (!normalized.endsWith('.md')) return null

  const parts = normalized.split('/')
  if (parts.length < 2) return null

  const secondSegment = parts[1]
  if (
    secondSegment === 'blueprints' ||
    secondSegment === 'tech-debt' ||
    secondSegment === 'plan-history'
  ) {
    const bpLabel = blueprintsRoot
      ? `${blueprintsRoot}/`
      : `${DEFAULT_BLUEPRINTS_ROOT}/ or ${BLUEPRINTS_ROOT}/`
    const tdLabel = techDebtRoot
      ? `${techDebtRoot}/`
      : `${DEFAULT_TECH_DEBT_ROOT}/ or ${TECH_DEBT_ROOT}/`
    return `Planning markdown must live under ${bpLabel} or ${tdLabel}. Got: ${normalized}`
  }

  if (parts[0] === 'platform') {
    const expectedBp = blueprintsRoot ?? BLUEPRINTS_ROOT
    return `Legacy planning paths under platform/* are no longer supported. Move blueprints to ${expectedBp}/.`
  }

  return null
}

/**
 * Returns true if the path is the canonical `_overview.md` location for any
 * accepted blueprints root layout (or the explicitly provided root).
 */
export function isCanonicalBlueprintOverviewPath(
  filePath: string,
  blueprintsRoot?: string,
): boolean {
  const normalized = normalizePlanningPath(filePath)
  const roots = blueprintsRoot ? [blueprintsRoot] : CANONICAL_BLUEPRINTS_ROOTS
  return roots.some((root) => {
    const rootParts = root.split('/')
    const parts = normalized.split('/')
    const n = rootParts.length
    return (
      parts.length === n + 3 &&
      parts.slice(0, n).join('/') === root &&
      BLUEPRINT_STATUSES.has(parts[n] ?? '') &&
      KEBAB_CASE_SEGMENT.test(parts[n + 1] ?? '') &&
      parts[n + 2] === '_overview.md'
    )
  })
}

export function getBlueprintPathViolation(
  filePath: string,
  blueprintsRoot?: string,
): string | null {
  const normalized = normalizePlanningPath(filePath)

  if (!isBlueprintPath(normalized, blueprintsRoot)) return null

  if (
    normalized.endsWith('/_overview.md') &&
    !isCanonicalBlueprintOverviewPath(normalized, blueprintsRoot)
  ) {
    const root = blueprintsRoot ?? BLUEPRINTS_ROOT
    return `Blueprint overview files must live at ${root}/<status>/<slug>/_overview.md. Got: ${normalized}`
  }

  const roots = blueprintsRoot ? [blueprintsRoot] : CANONICAL_BLUEPRINTS_ROOTS
  for (const root of roots) {
    const rootParts = root.split('/')
    const parts = normalized.split('/')
    const n = rootParts.length
    if (
      parts.length === n + 2 &&
      parts.slice(0, n).join('/') === root &&
      BLUEPRINT_STATUSES.has(parts[n] ?? '') &&
      normalized.endsWith('.md')
    ) {
      return `Blueprint markdown files cannot live directly under a status directory. Move this file to ${root}/${parts[n]}/<slug>/_overview.md or place supporting docs inside ${root}/${parts[n]}/<slug>/. Got: ${normalized}`
    }
  }

  return null
}
