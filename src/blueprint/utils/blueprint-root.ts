/**
 * Resolves the blueprints directory for a consumer repo.
 *
 * Checks in priority order:
 *   1. `<projectPath>/blueprints/`           — generic consumer layout
 *   2. `<projectPath>/webpresso/blueprints/` — webpresso legacy fallback
 *
 * Fresh generic repos default to `<projectPath>/blueprints/` when a normal
 * project marker is present. Historical empty fixtures and Webpresso roots keep
 * the legacy fallback so older callers that mkdir after service construction
 * still work.
 */
import { existsSync } from 'node:fs'
import path from 'node:path'

export const WEBPRESSO_CONFIG_PATH = 'webpresso/config.yaml'
export const WEBPRESSO_BLUEPRINTS_DIR = 'webpresso/blueprints'
export const DEFAULT_BLUEPRINTS_DIR = 'blueprints'

const GENERIC_PROJECT_MARKERS = ['.agent-kitrc.json', 'pnpm-workspace.yaml', 'package.json'] as const

export function hasWebpressoProjectMarker(projectPath: string): boolean {
  return existsSync(path.join(projectPath, WEBPRESSO_CONFIG_PATH))
}

export function hasGenericProjectMarker(projectPath: string): boolean {
  return GENERIC_PROJECT_MARKERS.some((marker) => existsSync(path.join(projectPath, marker)))
}

export function resolveBlueprintRoot(projectPath?: string): string {
  if (projectPath === undefined) {
    // Prefer generic consumer layout when the caller relies on cwd-relative
    // scanning. Fall back to Webpresso's historical relative path.
    if (existsSync(path.resolve(DEFAULT_BLUEPRINTS_DIR))) return DEFAULT_BLUEPRINTS_DIR
    if (existsSync(path.resolve(WEBPRESSO_BLUEPRINTS_DIR))) return WEBPRESSO_BLUEPRINTS_DIR
    return WEBPRESSO_BLUEPRINTS_DIR
  }

  const genericPath = path.join(projectPath, DEFAULT_BLUEPRINTS_DIR)
  if (existsSync(genericPath)) return genericPath

  const webpressoPath = path.join(projectPath, WEBPRESSO_BLUEPRINTS_DIR)
  if (existsSync(webpressoPath)) return webpressoPath

  if (hasGenericProjectMarker(projectPath) && !hasWebpressoProjectMarker(projectPath)) {
    return genericPath
  }

  return webpressoPath
}
