import type { CAC } from 'cac'

import { recordHookError } from '#hooks/errors/index.js'

const HOOK_NAMES = [
  'pretool-guard',
  'post-tool',
  'stop-qa',
  'guard-switch',
  'sessionstart-routing',
  'precompact-snapshot',
  'test-quality-check',
] as const

export type HookName = (typeof HOOK_NAMES)[number]

const HOOK_HANDLERS: Readonly<Record<HookName, (args: string[]) => Promise<void> | void>> = {
  'pretool-guard': async () => {
    const { main } = await import('#hooks/pretool-guard/index')
    await main()
  },
  'post-tool': async () => {
    const { main } = await import('#hooks/post-tool/lint-after-edit')
    await main()
  },
  'stop-qa': async () => {
    const { main } = await import('#hooks/stop/qa-changed-files')
    await main()
  },
  'guard-switch': async () => {
    const { main } = await import('#hooks/guard-switch/index')
    await main()
  },
  'sessionstart-routing': async () => {
    const { main } = await import('#hooks/sessionstart/index')
    await main()
  },
  'precompact-snapshot': async () => {
    const { main } = await import('#hooks/precompact/index')
    await main()
  },
  'test-quality-check': async (args) => {
    const { runTestQualityCheck } = await import('#hooks/test-quality-check')
    runTestQualityCheck(args)
  },
}

const HOOK_EVENT_BY_NAME: Readonly<Record<HookName, string>> = {
  'pretool-guard': 'PreToolUse',
  'post-tool': 'PostToolUse',
  'stop-qa': 'Stop',
  'guard-switch': 'UserPromptSubmit',
  'sessionstart-routing': 'SessionStart',
  'precompact-snapshot': 'PreCompact',
  'test-quality-check': 'TestQualityCheck',
}

const JSON_ONLY_HOOKS = new Set<HookName>(['stop-qa', 'precompact-snapshot'])

function binNameFor(hookName: HookName): string {
  return `wp-${hookName}`
}

function fallbackActionFor(hookName: HookName): string {
  if (JSON_ONLY_HOOKS.has(hookName)) return 'emit-empty-json'
  if (hookName === 'pretool-guard') return 'fail-closed-deny'
  return 'fail-open'
}

function truncateDetail(value: unknown): string {
  const detail = value instanceof Error ? value.stack || value.message : String(value)
  return detail.length > 1_000 ? `${detail.slice(0, 1_000)}…` : detail
}

function writePretoolDeny(reason: string): void {
  process.stdout.write(
    `${JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'PreToolUse',
        permissionDecision: 'deny',
        permissionDecisionReason: reason,
      },
    })}\n`,
  )
}

function handleHookError(name: HookName, error: unknown): void {
  const fallback = fallbackActionFor(name)
  const detail = truncateDetail(error)
  recordHookError({
    binName: binNameFor(name),
    hookName: name,
    event: HOOK_EVENT_BY_NAME[name],
    phase: 'handler',
    fallback,
    detail,
  })

  if (name === 'pretool-guard') {
    writePretoolDeny(`webpresso pretool guard failed: ${detail}`)
    return
  }
  if (JSON_ONLY_HOOKS.has(name)) {
    process.stdout.write('{}\n')
    return
  }
  process.stderr.write(`webpresso hook ${binNameFor(name)} failed open: ${detail}\n`)
}

export function isHookName(value: string): value is HookName {
  return value in HOOK_HANDLERS
}

export async function runHookCommand(name: string, args: string[] = []): Promise<void> {
  if (!isHookName(name)) {
    throw new Error(`Unknown hook "${name}". Expected one of: ${HOOK_NAMES.join(', ')}`)
  }
  try {
    await HOOK_HANDLERS[name](args)
  } catch (error) {
    handleHookError(name, error)
  }
}

export function registerHookCommand(cli: CAC): void {
  cli
    .command('hook <name> [...args]', 'Run an internal plugin hook entrypoint')
    .action(async (name: string, args: string[]) => {
      await runHookCommand(name, args)
      return 0
    })
}
