export const BLUEPRINTS_ROOT = 'webpresso/blueprints'
export const TECH_DEBT_ROOT = 'webpresso/tech-debt'
const BLUEPRINT_STATUSES = new Set([
  'draft',
  'planned',
  'parked',
  'in-progress',
  'completed',
  'archived',
])
const KEBAB_CASE_SEGMENT = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function normalizePlanningPath(filePath: string): string {
  return filePath.replace(/\\/g, '/').replace(/^\//, '')
}

export function isBlueprintPath(filePath: string): boolean {
  const normalized = normalizePlanningPath(filePath)
  return normalized === BLUEPRINTS_ROOT || normalized.startsWith(`${BLUEPRINTS_ROOT}/`)
}

export function getNonCanonicalPlanningPathViolation(filePath: string): string | null {
  const normalized = normalizePlanningPath(filePath)

  if (
    normalized === BLUEPRINTS_ROOT ||
    normalized.startsWith(`${BLUEPRINTS_ROOT}/`) ||
    normalized === TECH_DEBT_ROOT ||
    normalized.startsWith(`${TECH_DEBT_ROOT}/`)
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
    return `Planning markdown must live under ${BLUEPRINTS_ROOT}/ or ${TECH_DEBT_ROOT}/. Got: ${normalized}`
  }

  if (parts[0] === 'platform') {
    return `Legacy planning paths under platform/* are no longer supported. Move blueprints to ${BLUEPRINTS_ROOT}/.`
  }

  return null
}

export function isCanonicalBlueprintOverviewPath(filePath: string): boolean {
  const normalized = normalizePlanningPath(filePath)
  const parts = normalized.split('/')
  return (
    parts.length === 5 &&
    parts[0] === 'webpresso' &&
    parts[1] === 'blueprints' &&
    BLUEPRINT_STATUSES.has(parts[2] ?? '') &&
    KEBAB_CASE_SEGMENT.test(parts[3] ?? '') &&
    parts[4] === '_overview.md'
  )
}

export function getBlueprintPathViolation(filePath: string): string | null {
  const normalized = normalizePlanningPath(filePath)

  if (!isBlueprintPath(normalized)) return null

  if (normalized.endsWith('/_overview.md') && !isCanonicalBlueprintOverviewPath(normalized)) {
    return `Blueprint overview files must live at webpresso/blueprints/<status>/<slug>/_overview.md. Got: ${normalized}`
  }

  const parts = normalized.split('/')
  if (
    parts.length === 4 &&
    parts[0] === 'webpresso' &&
    parts[1] === 'blueprints' &&
    BLUEPRINT_STATUSES.has(parts[2] ?? '') &&
    normalized.endsWith('.md')
  ) {
    return `Blueprint markdown files cannot live directly under a status directory. Move this file to webpresso/blueprints/${parts[2]}/<slug>/_overview.md or place supporting docs inside webpresso/blueprints/${parts[2]}/<slug>/. Got: ${normalized}`
  }

  return null
}
