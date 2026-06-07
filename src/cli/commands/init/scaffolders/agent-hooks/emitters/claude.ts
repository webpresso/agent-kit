/**
 * Claude Code emitter — converts WP_HOOK_SPECS into the HooksMap format
 * that Claude Code's settings.json `hooks` key expects.
 *
 * Extracted from buildWebpressoHookGroups in index.ts. The function
 * buildWebpressoHookGroups in index.ts now delegates here for backward compat.
 */

import type { HooksMap, MatcherSet } from '#cli/commands/init/scaffolders/agent-hooks/ir.js'
import { WP_HOOK_SPECS } from '#cli/commands/init/scaffolders/agent-hooks/ir.js'

/**
 * Converts WP_HOOK_SPECS into the HooksMap format that Claude Code's
 * settings.json expects. Each spec becomes a HookGroup under the matching
 * event key. Specs with a `matcher` key reference the corresponding field
 * in the provided MatcherSet.
 */
export function buildClaudeHookGroups(input: {
  resolveBin: (name: string) => string
  matchers: MatcherSet
}): HooksMap {
  const { resolveBin, matchers } = input
  const result: HooksMap = {}

  for (const spec of WP_HOOK_SPECS) {
    const group = {
      ...(spec.matcher !== undefined ? { matcher: matchers[spec.matcher] } : {}),
      hooks: [{ type: 'command', command: resolveBin(spec.bin), timeout: spec.timeout }],
    }
    const existing = result[spec.event] ?? []
    result[spec.event] = [...existing, group]
  }

  return result
}
