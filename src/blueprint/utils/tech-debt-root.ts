/**
 * Resolves the tech-debt directory for a consumer repo.
 *
 * Generic consumers use `<repo>/tech-debt`. Webpresso keeps its historical
 * `<repo>/webpresso/tech-debt` layout as a fallback when that directory or the
 * `webpresso/config.yaml` sentinel is present.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'

import { hasGenericProjectMarker, hasWebpressoProjectMarker } from './blueprint-root.js'

export const WEBPRESSO_TECH_DEBT_DIR = 'webpresso/tech-debt'
export const DEFAULT_TECH_DEBT_DIR = 'tech-debt'

export function resolveTechDebtRoot(projectPath?: string): string {
  if (projectPath === undefined) {
    if (existsSync(path.resolve(DEFAULT_TECH_DEBT_DIR))) return DEFAULT_TECH_DEBT_DIR
    if (existsSync(path.resolve(WEBPRESSO_TECH_DEBT_DIR))) return WEBPRESSO_TECH_DEBT_DIR
    return WEBPRESSO_TECH_DEBT_DIR
  }

  const genericPath = path.join(projectPath, DEFAULT_TECH_DEBT_DIR)
  if (existsSync(genericPath)) return genericPath

  const webpressoPath = path.join(projectPath, WEBPRESSO_TECH_DEBT_DIR)
  if (existsSync(webpressoPath)) return webpressoPath

  if (hasGenericProjectMarker(projectPath) && !hasWebpressoProjectMarker(projectPath)) {
    return genericPath
  }

  return webpressoPath
}
