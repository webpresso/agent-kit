import type { HooksMap } from '#cli/commands/init/scaffolders/agent-hooks/ir.js'
import { HOOK_EVENT_NAMES } from '#cli/commands/init/scaffolders/agent-hooks/ir.js'
import { readInstalledHooksMap } from '#hooks/shared/installed-hooks.js'

export type DispatchOptions = {
  readonly event: string
  readonly vendor: 'claude' | 'codex'
  readonly dryRun: boolean
  readonly repoRoot: string
}

export type DispatchResult = {
  readonly event: string
  readonly vendor: string
  readonly hooks: readonly DispatchedHook[]
}

export type DispatchedHook = {
  readonly command: string
  readonly matcher: string | undefined
  readonly dryRun: true
}

/**
 * Core dispatch logic — pure and testable.
 *
 * Validates the event against HOOK_EVENT_NAMES, finds registered hook
 * groups for that event in the provided HooksMap, and returns a
 * DispatchResult. In dry-run mode (currently always true until live
 * invocation is wired), hooks are listed but not executed.
 */
export async function dispatch(
  hooksMap: HooksMap,
  options: DispatchOptions,
): Promise<DispatchResult> {
  const validEvents: readonly string[] = HOOK_EVENT_NAMES
  if (!validEvents.includes(options.event)) {
    throw new Error(
      `Unknown hook event "${options.event}". Valid events: ${validEvents.join(', ')}`,
    )
  }

  const groups = hooksMap[options.event] ?? []
  const dispatched: DispatchedHook[] = []

  for (const group of groups) {
    for (const hookEntry of group.hooks) {
      dispatched.push({
        command: hookEntry.command,
        matcher: group.matcher,
        dryRun: true,
      })
    }
  }

  return {
    event: options.event,
    vendor: options.vendor,
    hooks: dispatched,
  }
}

function printResult(result: DispatchResult): void {
  const { event, vendor, hooks } = result
  if (hooks.length === 0) {
    console.log(`wp hooks dispatch: no hooks registered for "${event}" (vendor: ${vendor})`)
    return
  }
  console.log(`wp hooks dispatch — event: ${event}, vendor: ${vendor}, dry-run: true`)
  console.log('')
  for (const hook of hooks) {
    const matcherLabel = hook.matcher !== undefined ? `  matcher: ${hook.matcher}` : ''
    console.log(`  command: ${hook.command}${matcherLabel !== '' ? `\n${matcherLabel}` : ''}`)
  }
}

/**
 * CLI entry point for `wp hooks dispatch <event> [--dry-run] [--vendor <vendor>]`.
 *
 * Parses argv, reads the vendor hook config, calls dispatch(), and prints
 * a formatted summary. Live invocation is deferred — dry-run is always
 * forced until a follow-up task wires real subprocess execution.
 */
export async function dispatchCommand(argv: readonly string[]): Promise<void> {
  const args = [...argv]

  let vendor: 'claude' | 'codex' = 'claude'
  const vendorIdx = args.indexOf('--vendor')
  if (vendorIdx !== -1 && vendorIdx + 1 < args.length) {
    const vendorArg = args[vendorIdx + 1]
    if (vendorArg === 'codex') {
      vendor = 'codex'
    }
    args.splice(vendorIdx, 2)
  }

  const dryRunIdx = args.indexOf('--dry-run')
  if (dryRunIdx !== -1) {
    args.splice(dryRunIdx, 1)
  }
  // Live invocation not yet wired — always dry-run for T4.
  const dryRun = true

  const event = args[0]
  if (event === undefined || event.startsWith('--')) {
    console.error('Usage: wp hooks dispatch <event> [--dry-run] [--vendor <claude|codex>]')
    console.error(`Valid events: ${HOOK_EVENT_NAMES.join(', ')}`)
    process.exitCode = 1
    return
  }

  const repoRoot = process.cwd()
  const hooksMap = readInstalledHooksMap(repoRoot, vendor)

  let result: DispatchResult
  try {
    result = await dispatch(hooksMap, { event, vendor, dryRun, repoRoot })
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
    return
  }

  printResult(result)
}
