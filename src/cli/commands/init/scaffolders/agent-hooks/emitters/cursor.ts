import type { MatcherSet } from '#cli/commands/init/scaffolders/agent-hooks/ir.js'
import { WP_HOOK_SPECS } from '#cli/commands/init/scaffolders/agent-hooks/ir.js'
import type { CursorHooksConfig } from '#cli/commands/init/scaffolders/agent-hooks/schemas/cursor-hooks.schema.js'

type CursorEventName = 'sessionStart' | 'preToolUse' | 'postToolUse' | 'beforeSubmitPrompt' | 'stop'

const CURSOR_EVENT_MAP = {
  SessionStart: 'sessionStart',
  PreToolUse: 'preToolUse',
  PostToolUse: 'postToolUse',
  UserPromptSubmit: 'beforeSubmitPrompt',
  Stop: 'stop',
} as const satisfies Partial<Record<(typeof WP_HOOK_SPECS)[number]['event'], CursorEventName>>

type CursorConfigEventKey = Exclude<keyof CursorHooksConfig, 'version'>

const EMPTY_JSON_OBJECT_COMMAND = "printf '%s\\n' '{}'"

function materializeCursorCommand(command: string): string {
  return command.replaceAll(/\|\|\s*true\b/gu, `|| ${EMPTY_JSON_OBJECT_COMMAND}`)
}

export function buildCursorHooksConfig(input: {
  resolveBin: (name: string) => string
  matchers: MatcherSet
}): CursorHooksConfig {
  const { resolveBin, matchers } = input
  const config: CursorHooksConfig = { version: 1 }

  for (const spec of WP_HOOK_SPECS) {
    const event = CURSOR_EVENT_MAP[spec.event as keyof typeof CURSOR_EVENT_MAP] as
      | CursorConfigEventKey
      | undefined
    if (event === undefined) continue

    const group = {
      ...(spec.matcher !== undefined ? { matcher: matchers[spec.matcher] } : {}),
      ...(spec.event === 'PreToolUse' ? { failClosed: true } : {}),
      hooks: [
        { type: 'command' as const, command: materializeCursorCommand(resolveBin(spec.bin)) },
      ],
    }

    const existing = config[event] ?? []
    config[event] = [...existing, group]
  }

  return config
}
