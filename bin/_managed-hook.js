#!/usr/bin/env node

import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import {
  existsSync,
  mkdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join } from 'node:path'

import { buildLaunchPlan } from './_run.js'

const PRETOOL_GUARD_RUNTIME_UNAVAILABLE_REASON =
  'wp native hook runtime is unavailable. Reinstall @webpresso/agent-kit without omitting optional dependencies and re-run wp setup.'
const JSON_ONLY_HOOKS = new Set(['wp-stop-qa', 'wp-precompact-snapshot'])
const MAX_ERROR_ENTRIES = 20
const MAX_DETAIL_CHARS = 500
const HOOK_EVENTS = new Map([
  ['wp-sessionstart-routing', 'SessionStart'],
  ['wp-pretool-guard', 'PreToolUse'],
  ['wp-post-tool', 'PostToolUse'],
  ['wp-guard-switch', 'UserPromptSubmit'],
  ['wp-stop-qa', 'Stop'],
  ['wp-precompact-snapshot', 'PreCompact'],
])

function sha256Hex(value) {
  return createHash('sha256').update(value).digest('hex')
}

function resolveCwd() {
  return process.env.CLAUDE_PROJECT_DIR ?? process.cwd()
}

function runGit(args, cwd) {
  return spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).stdout?.trim()
}

function resolveStateRoot() {
  const home = homedir()
  if (process.platform === 'darwin') return join(home, 'Library', 'Application Support', 'webpresso')
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA ?? join(home, 'AppData', 'Local')
    return join(localAppData, 'webpresso', 'Data')
  }
  return join(process.env.XDG_DATA_HOME ?? join(home, '.local', 'share'), 'webpresso')
}

function resolveHookErrorsPath() {
  if (process.env.WP_HOOK_ERRORS_PATH) return process.env.WP_HOOK_ERRORS_PATH

  const root = resolveStateRoot()
  const cwd = resolveCwd()
  const commonDir = runGit(['rev-parse', '--git-common-dir'], cwd)
  if (!commonDir) return join(root, 'hook-errors.json')

  try {
    const absolute = realpathSync(commonDir.startsWith('/') ? commonDir : join(cwd, commonDir))
    return join(root, sha256Hex(absolute).slice(0, 16), 'hook-errors.json')
  } catch {
    return join(root, 'hook-errors.json')
  }
}

function truncateDetail(value) {
  if (!value) return undefined
  const normalized = String(value).replace(/\s+/gu, ' ').trim()
  if (normalized.length <= MAX_DETAIL_CHARS) return normalized
  return `${normalized.slice(0, MAX_DETAIL_CHARS)}…`
}

function readHookErrorEntries(indexPath) {
  if (!existsSync(indexPath)) return []
  try {
    const parsed = JSON.parse(readFileSync(indexPath, 'utf8'))
    return Array.isArray(parsed?.entries) ? parsed.entries : []
  } catch {
    return []
  }
}

function writeHookErrorIndex(indexPath, entries) {
  mkdirSync(dirname(indexPath), { recursive: true })
  const tmpPath = `${indexPath}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`
  writeFileSync(
    tmpPath,
    `${JSON.stringify({ version: 1, entries: entries.slice(0, MAX_ERROR_ENTRIES) }, null, 2)}\n`,
    'utf8',
  )
  renameSync(tmpPath, indexPath)
}

function recordHookError(binName, hookName, partial) {
  try {
    const indexPath = resolveHookErrorsPath()
    const entries = readHookErrorEntries(indexPath)
    const event = HOOK_EVENTS.get(binName) ?? hookName
    const entry = {
      timestamp: new Date().toISOString(),
      binName,
      hookName,
      event,
      phase: partial.phase,
      fallback: fallbackActionFor(binName),
      ...(partial.status === undefined ? {} : { status: partial.status }),
      ...(partial.signal === undefined ? {} : { signal: partial.signal }),
      ...(partial.detail === undefined ? {} : { detail: truncateDetail(partial.detail) }),
    }
    writeHookErrorIndex(indexPath, [entry, ...entries])
  } catch {
    // Hook error persistence is diagnostic-only; never let it affect hook policy.
  }
}

function writePretoolDeny(reason) {
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

function warn(binName, detail) {
  const suffix = detail ? `: ${detail}` : ''
  console.error(
    `webpresso hook ${binName} skipped: native hook runtime unavailable${suffix}; reinstall @webpresso/agent-kit without omitting optional dependencies and re-run wp setup`,
  )
}

function fallback(binName, hookName, error, phase = 'launch') {
  const detail = error instanceof Error ? error.message : String(error ?? '')
  recordHookError(binName, hookName, { phase, detail })
  if (binName === 'wp-pretool-guard') {
    writePretoolDeny(PRETOOL_GUARD_RUNTIME_UNAVAILABLE_REASON)
    return 0
  }

  warn(binName, detail)
  if (JSON_ONLY_HOOKS.has(binName)) process.stdout.write('{}\n')
  return 0
}

function writeBufferedOutput(child) {
  if (child.stdout) process.stdout.write(child.stdout)
  if (child.stderr) process.stderr.write(child.stderr)
}

function describeChildFailure(child) {
  if (child.signal) return `status=none signal=${child.signal}`
  return `status=${child.status ?? 'unknown'} signal=none`
}

function fallbackActionFor(binName) {
  if (binName === 'wp-pretool-guard') return 'fail-closed-deny'
  if (JSON_ONLY_HOOKS.has(binName)) return 'emit-empty-json'
  return 'fail-open'
}

function warnUnexpectedChildFailure(binName, hookName, child) {
  const event = HOOK_EVENTS.get(binName) ?? hookName
  console.error(
    `webpresso hook ${binName} degraded: hook=${hookName} event=${event} ${describeChildFailure(
      child,
    )} fallback=${fallbackActionFor(binName)}`,
  )
}

function handleUnexpectedChildFailure(binName, hookName, child) {
  warnUnexpectedChildFailure(binName, hookName, child)
  recordHookError(binName, hookName, {
    phase: child.signal ? 'signal' : 'child',
    status: child.status ?? undefined,
    signal: child.signal ?? undefined,
  })

  if (binName === 'wp-pretool-guard') {
    const statusOrSignal = child.signal
      ? `signal ${child.signal}`
      : `status ${child.status ?? 'unknown'}`
    writePretoolDeny(`wp-pretool-guard failed unexpectedly (${statusOrSignal}); failing closed.`)
    return 0
  }

  if (JSON_ONLY_HOOKS.has(binName)) {
    process.stdout.write('{}\n')
  }

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
    process.exit(fallback(binName, hookName, error))
  }

  const child = spawnSync(plan.runtime, plan.args, {
    stdio: ['inherit', 'pipe', 'pipe'],
    env: plan.env ?? process.env,
  })

  if (child.error) {
    process.exit(fallback(binName, hookName, child.error, 'spawn'))
  }

  if (child.status === 0 || child.status === 2) {
    writeBufferedOutput(child)
    process.exit(child.status)
  }

  process.exit(handleUnexpectedChildFailure(binName, hookName, child))
}
