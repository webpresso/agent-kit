import { afterEach, beforeEach } from 'vitest'

import { clearManagedRunnerCache, setRtkAvailabilityProbeForTest } from '#tool-runtime'

export interface ManagedRunnerHarnessOptions {
  readonly rtkAvailable?: boolean
}

/**
 * Pin managed-runner RTK availability for one test module so command-shape
 * assertions stay hermetic regardless of the host PATH or CI image.
 *
 * Tests that need a different lane can still override the probe explicitly in
 * their own body; this hook only establishes the per-test baseline.
 */
export function installManagedRunnerHermeticHooks(options: ManagedRunnerHarnessOptions = {}): void {
  const { rtkAvailable = true } = options

  beforeEach(() => {
    setRtkAvailabilityProbeForTest(rtkAvailable)
  })

  afterEach(() => {
    setRtkAvailabilityProbeForTest(null)
    clearManagedRunnerCache()
  })
}
