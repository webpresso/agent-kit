import { sep } from 'node:path'

import { resolveBinaryOnPath } from '#cli/commands/init/scaffolders/agent-hooks/codex-global-normalize'

function isProjectLocalVp(candidate: string): boolean {
  return candidate.includes(`${sep}node_modules${sep}`) && !candidate.includes(`${sep}.vite-plus${sep}`)
}

export function resolveGlobalCapableVp(
  pathValue: string = process.env.PATH ?? '',
  platformValue: NodeJS.Platform = process.platform,
): string | null {
  const candidate = resolveBinaryOnPath('vp', pathValue, platformValue)
  if (candidate === null) return null
  return isProjectLocalVp(candidate) ? null : candidate
}
