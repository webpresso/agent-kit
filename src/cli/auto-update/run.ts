/**
 * Auto-update orchestrator.
 *
 * `runUpdateFlow(version)` is the single entry point called from bootstrap.ts.
 * It checks the registry for a newer version and, when one is available:
 *   1. Prints the boxen banner via update-notifier.
 *   2. Optionally schedules a deferred background install (unless opt-out).
 *
 * The function NEVER throws — all errors are sunk to logUpdateError per D13.
 *
 * ## configPath note
 * update-notifier v7.3.1 does NOT expose a `configPath` (or equivalent) option
 * in its public constructor API. The configstore path is derived internally as
 * `update-notifier-<pkgName>` inside the XDG config dir. Passing a custom path
 * is not possible without monkey-patching the library. The plan's "pass
 * configPath overriding to point at getSurfacePath('update-notifier-cache.json',
 * 'user')" is therefore not implementable through the public API.
 *
 * The tombstone and concurrency-lockout machinery in installer.ts still reads
 * and writes `getSurfacePath('update-notifier-cache.json', 'user')` so those
 * paths remain consistent within the agent-kit state root. The notifier's own
 * cache (for the registry poll interval) lives in the standard XDG config dir
 * as managed by the library.
 */

import updateNotifier from 'update-notifier'

import { detect } from './detect-pm.js'
import { scheduleDeferredInstall } from './installer.js'
import { logUpdateError } from './log.js'
import { shouldSkipAutoInstall } from './skip.js'

const PACKAGE_NAME = 'webpresso'
const UPDATE_CHECK_INTERVAL = 1000 * 60 * 60 * 24 // 24 hours

/**
 * Orchestrate the full auto-update pipeline for the given package version.
 * Resolves without throwing — any error is written to auto-update.log.
 */
export async function runUpdateFlow(version: string): Promise<void> {
  try {
    const notifier = updateNotifier({
      pkg: { name: PACKAGE_NAME, version },
      updateCheckInterval: UPDATE_CHECK_INTERVAL,
    })

    const update = await notifier.fetchInfo()

    if (update === null || update.type === 'latest') {
      return
    }

    // Update is available — print the boxen banner.
    notifier.notify({ defer: true, isGlobal: true })

    if (shouldSkipAutoInstall(process.env)) {
      return
    }

    const plan = detect(process.env, process.argv[1] ?? '')
    if ('abort' in plan) {
      logUpdateError(new Error(plan.abort))
      return
    }

    scheduleDeferredInstall({ command: plan.command })
  } catch (err) {
    logUpdateError(err)
  }
}
