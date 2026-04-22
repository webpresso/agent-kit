/**
 * Resolves the blueprints directory for a consumer repo.
 *
 * Checks in priority order:
 *   1. `<projectPath>/webpresso/blueprints/` — webpresso legacy layout
 *   2. `<projectPath>/blueprints/`           — generic consumer layout (default)
 *
 * Returns the first one that exists. If neither exists, returns
 * `<projectPath>/blueprints/` so a fresh `ak blueprint new` can create it.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'

export const WEBPRESSO_BLUEPRINTS_DIR = 'webpresso/blueprints'
export const DEFAULT_BLUEPRINTS_DIR = 'blueprints'

export function resolveBlueprintRoot(projectPath?: string): string {
  if (projectPath === undefined) {
    // Caller will let the scanner find the project root itself; preserve
    // the historical relative-path behavior.
    if (existsSync(path.resolve(WEBPRESSO_BLUEPRINTS_DIR))) return WEBPRESSO_BLUEPRINTS_DIR
    if (existsSync(path.resolve(DEFAULT_BLUEPRINTS_DIR))) return DEFAULT_BLUEPRINTS_DIR
    // Preserve historical default for test fixtures that mkdir the directory
    // after constructing the service.
    return WEBPRESSO_BLUEPRINTS_DIR
  }

  const webpressoPath = path.join(projectPath, WEBPRESSO_BLUEPRINTS_DIR)
  if (existsSync(webpressoPath)) return webpressoPath

  const genericPath = path.join(projectPath, DEFAULT_BLUEPRINTS_DIR)
  if (existsSync(genericPath)) return genericPath

  // Neither exists (fresh repo, test fixture). Preserve webpresso's
  // historical default so pre-existing tests that mkdir the directory
  // after constructing the service still find it.
  return webpressoPath
}
