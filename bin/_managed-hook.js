#!/usr/bin/env node

import { spawnSync } from 'node:child_process'

import { buildLaunchPlan } from './_run.js'

const PRETOOL_GUARD_DENY =
  '{"hookSpecificOutput":{"hookEventName":"PreToolUse","permissionDecision":"deny","permissionDecisionReason":"wp native hook runtime is unavailable. Reinstall @webpresso/agent-kit without omitting optional dependencies and re-run wp setup."}}'
const JSON_ONLY_HOOKS = new Set(['wp-stop-qa', 'wp-precompact-snapshot'])

function warn(binName, detail) {
  const suffix = detail ? `: ${detail}` : ''
  console.error(
    `webpresso hook ${binName} skipped: native hook runtime unavailable${suffix}; reinstall @webpresso/agent-kit without omitting optional dependencies and re-run wp setup`,
  )
}

function fallback(binName, error) {
  const detail = error instanceof Error ? error.message : String(error ?? '')
  if (binName === 'wp-pretool-guard') {
    process.stdout.write(`${PRETOOL_GUARD_DENY}\n`)
    return 0
  }

  warn(binName, detail)
  if (JSON_ONLY_HOOKS.has(binName)) process.stdout.write('{}\n')
  return 0
}

export function runManagedHook(binName, hookName, argv = process.argv.slice(2)) {
  const forwardedArgs = ['hook', hookName, ...argv]
  let plan

  try {
    plan = buildLaunchPlan({
      binName: 'wp',
      forwardedArgs,
      // Managed hook launchers must never fall through to the built JS lane:
      // a runtime-absent install can have a mismatched setup-time Node, and the
      // built-lane pin would brick the hook before shell fallbacks can run.
      sourceExists: false,
      builtExists: false,
    })
  } catch (error) {
    process.exit(fallback(binName, error))
  }

  const child = spawnSync(plan.runtime, plan.args, {
    stdio: 'inherit',
    env: plan.env ?? process.env,
  })

  if (child.error) {
    process.exit(fallback(binName, child.error))
  }

  if (child.signal) {
    process.kill(process.pid, child.signal)
    return
  }

  process.exit(child.status ?? 1)
}
