import { describe, expect, it, vi } from 'vitest'

import {
  installBrowser,
  openBrowserUrl,
  type BrowserDoctorResult,
  type BrowserName,
} from './runtime.js'

function spawnResult(overrides: { status?: number | null; stderr?: string } = {}) {
  return {
    status: overrides.status ?? 0,
    signal: null,
    output: [],
    pid: 1,
    stdout: '',
    stderr: overrides.stderr ?? '',
  }
}

function doctorResult(
  overrides: Partial<BrowserDoctorResult> = {},
  browser: BrowserName = 'chromium',
): BrowserDoctorResult {
  return {
    ok: true,
    packageAvailable: true,
    packageVersion: '1.60.0',
    browser,
    executablePath: `/cache/${browser}/browser`,
    executableExists: true,
    cachePath: '/cache/ms-playwright',
    ...overrides,
  }
}

describe('browser runtime', () => {
  it('installs chromium through npx playwright by default', () => {
    const run = vi.fn(() => spawnResult())

    expect(installBrowser({ run }).status).toBe(0)
    expect(run).toHaveBeenCalledWith('npx', ['playwright', 'install', 'chromium'])
  })

  it('allows selecting another Playwright browser', () => {
    const run = vi.fn(() => spawnResult())

    installBrowser({ browser: 'firefox', run })

    expect(run).toHaveBeenCalledWith('npx', ['playwright', 'install', 'firefox'])
  })

  it('open preflights browser availability and returns the install command', async () => {
    await expect(
      openBrowserUrl('https://example.test', {
        doctor: async () =>
          doctorResult({
            ok: false,
            executableExists: false,
            hint: 'Playwright chromium is not installed; run `wp browser install chromium`.',
            installCommand: 'wp browser install chromium',
          }),
      }),
    ).resolves.toMatchObject({
      ok: false,
      browser: 'chromium',
      requestedUrl: 'https://example.test',
      installCommand: 'wp browser install chromium',
      errors: [expect.stringContaining('wp browser install chromium')],
    })
  })
})
