export const BLUEPRINTS_ROOT = 'webpresso/blueprints'
export const TECH_DEBT_ROOT = 'webpresso/tech-debt'
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

  if (!normalized.endsWith('.md')) {
    return null
  }

  const parts = normalized.split('/')
  if (parts.length < 2) {
    return null
  }

  const secondSegment = parts[1]
  if (secondSegment === 'blueprints' || secondSegment === 'tech-debt' || secondSegment === 'plan-history') {
    return `Planning markdown must live under ${BLUEPRINTS_ROOT}/ or ${TECH_DEBT_ROOT}/. Got: ${normalized}`
  }

  return null
}
