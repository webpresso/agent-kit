import { afterEach, describe, expect, it, vi } from 'vitest'

import { registerBrowserCommand } from './browser.js'

function buildFakeCli() {
  const options: string[] = []
  let capturedAction:
    | ((action: string, target: string | undefined, flags: Record<string, unknown>) => unknown)
    | undefined
  const chain = {
    option: (name: string) => {
      options.push(name)
      return chain
    },
    action: (fn: typeof capturedAction) => {
      capturedAction = fn
      return chain
    },
  }
  return {
    command: () => chain,
    getOptions: () => options,
    getAction: () => capturedAction,
  }
}

function captureConsole() {
  const stdout: string[] = []
  vi.spyOn(console, 'log').mockImplementation((message?: unknown) => {
    stdout.push(String(message ?? ''))
  })
  return stdout
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('wp browser command', () => {
  it('registers JSON-capable browser helpers', () => {
    const cli = buildFakeCli()
    registerBrowserCommand(cli as never)

    expect(cli.getOptions()).toContain('--json')
  })

  it('prints an actionable install command when doctor reports a missing browser', async () => {
    const cli = buildFakeCli()
    const stdout = captureConsole()
    registerBrowserCommand(cli as never, {
      browserDoctor: async () => ({
        ok: false,
        packageAvailable: true,
        packageVersion: '1.60.0',
        browser: 'chromium',
        executablePath: '/cache/chromium/missing',
        executableExists: false,
        cachePath: '/cache/ms-playwright',
        hint: 'Playwright chromium is not installed; run `wp browser install chromium`.',
        installCommand: 'wp browser install chromium',
      }),
    })

    await expect(cli.getAction()?.('doctor', undefined, {})).rejects.toMatchObject({ exitCode: 1 })
    expect(stdout.join('\n')).toContain('Install: wp browser install chromium')
    expect(stdout.join('\n')).toContain('Hint: Playwright chromium is not installed')
  })

  it('returns the install status for browser install', async () => {
    const cli = buildFakeCli()
    const installBrowser = vi.fn(() => ({ status: 0 }))
    registerBrowserCommand(cli as never, { installBrowser })

    await expect(cli.getAction()?.('install', 'firefox', {})).resolves.toBe(0)
    expect(installBrowser).toHaveBeenCalledWith({ browser: 'firefox' })
  })

  it('preflights open failures with the same install command', async () => {
    const cli = buildFakeCli()
    const stdout = captureConsole()
    registerBrowserCommand(cli as never, {
      openBrowserUrl: async () => ({
        ok: false,
        browser: 'chromium',
        requestedUrl: 'https://example.test',
        errors: ['Playwright chromium is not installed; run `wp browser install chromium`.'],
        hint: 'Playwright chromium is not installed; run `wp browser install chromium`.',
        installCommand: 'wp browser install chromium',
      }),
    })

    await expect(cli.getAction()?.('open', 'https://example.test', {})).rejects.toMatchObject({
      exitCode: 1,
    })
    expect(stdout.join('\n')).toContain('Install: wp browser install chromium')
    expect(stdout.join('\n')).toContain('Errors:')
  })
})
