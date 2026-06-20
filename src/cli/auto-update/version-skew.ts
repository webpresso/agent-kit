import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import yaml from 'js-yaml'

const PACKAGE_NAME = '@webpresso/agent-kit'

function findWorkspaceFile(startDir: string): string | null {
  let current = startDir
  for (;;) {
    const candidate = join(current, 'pnpm-workspace.yaml')
    if (existsSync(candidate)) return candidate
    const parent = dirname(current)
    if (parent === current) return null
    current = parent
  }
}

function extractPinnedVersion(workspaceFile: string): string | null {
  try {
    const content = readFileSync(workspaceFile, 'utf-8')
    const parsed: unknown = yaml.load(content)
    if (parsed === null || typeof parsed !== 'object') return null
    if (!('catalog' in parsed)) return null
    const catalog: unknown = (parsed as Record<string, unknown>)['catalog']
    if (catalog === null || typeof catalog !== 'object') return null
    const pin: unknown = (catalog as Record<string, unknown>)[PACKAGE_NAME]
    if (typeof pin !== 'string' || pin.length === 0) return null
    // Strip semver range operators (^, ~, >=, >, <=, <, =, v)
    return pin.replace(/^[~^>=<v]+/, '').trim()
  } catch {
    return null
  }
}

/**
 * Returns a warning string when the running wp version differs from the
 * repo-pinned @webpresso/agent-kit in pnpm-workspace.yaml catalog.
 * Returns null when aligned or no pin can be resolved.
 */
export function checkVersionSkew(
  runningVersion: string,
  cwd: string = process.cwd(),
): string | null {
  const workspaceFile = findWorkspaceFile(cwd)
  if (workspaceFile === null) return null

  const pinnedVersion = extractPinnedVersion(workspaceFile)
  if (pinnedVersion === null) return null

  if (runningVersion === pinnedVersion) return null

  return (
    `[wp] Version skew: global wp is ${runningVersion} but this repo pins ` +
    `@webpresso/agent-kit@${pinnedVersion} in pnpm-workspace.yaml. ` +
    `Consumer repos should depend on \`@webpresso/agent-config\` and use global \`wp\`, ` +
    `not keep \`@webpresso/agent-kit\` as a repo dependency. Remove the stale pin if this is a ` +
    `consumer repo, or run \`vp install -g @webpresso/agent-kit@${pinnedVersion}\` if this repo ` +
    `intentionally owns the shared wp runtime.`
  )
}
