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
  it('registers ensure and JSON-capable browser helpers', () => {
    const cli = buildFakeCli()
    registerBrowserCommand(cli as never)

    expect(cli.getOptions()).toContain('--json')
  })

  it('prints an actionable ensure command when doctor reports a missing browser', async () => {
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
        hint: 'Playwright chromium is not installed; run `wp browser ensure chromium`.',
        installCommand: 'wp browser ensure chromium',
      }),
    })

    await expect(cli.getAction()?.('doctor', undefined, {})).rejects.toMatchObject({ exitCode: 1 })
    expect(stdout.join('\n')).toContain('Install: wp browser ensure chromium')
    expect(stdout.join('\n')).toContain('Hint: Playwright chromium is not installed')
  })

  it('runs ensure and reports already-installed browsers without installing', async () => {
    const cli = buildFakeCli()
    const stdout = captureConsole()
    const ensureBrowser = vi.fn(async () => ({
      ok: true,
      browser: 'chromium' as const,
      alreadyInstalled: true,
      installed: false,
      doctor: {
        ok: true,
        packageAvailable: true,
        browser: 'chromium' as const,
        executableExists: true,
        executablePath: '/cache/chromium/browser',
        cachePath: '/cache/ms-playwright',
      },
      errors: [],
      installCommand: 'wp browser ensure chromium',
    }))
    registerBrowserCommand(cli as never, { ensureBrowser })

    await expect(cli.getAction()?.('ensure', 'chromium', {})).resolves.toBe(0)
    expect(ensureBrowser).toHaveBeenCalledWith({ browser: 'chromium' })
    expect(stdout.join('\n')).toContain('Playwright chromium already installed.')
  })

  it('returns an actionable ensure error when ensure cannot install the browser', async () => {
    const cli = buildFakeCli()
    const stdout = captureConsole()
    registerBrowserCommand(cli as never, {
      ensureBrowser: async () => ({
        ok: false,
        browser: 'chromium',
        alreadyInstalled: false,
        installed: false,
        doctor: {
          ok: false,
          packageAvailable: true,
          browser: 'chromium',
          executableExists: false,
          cachePath: '/cache/ms-playwright',
        },
        errors: ['Failed to install; rerun `wp browser ensure chromium`.'],
        installCommand: 'wp browser ensure chromium',
      }),
    })

    await expect(cli.getAction()?.('ensure', 'chromium', {})).rejects.toMatchObject({ exitCode: 1 })
    expect(stdout.join('\n')).toContain('Install: wp browser ensure chromium')
    expect(stdout.join('\n')).toContain('Error: Failed to install')
  })

  it('preflights open failures with the same ensure command', async () => {
    const cli = buildFakeCli()
    const stdout = captureConsole()
    registerBrowserCommand(cli as never, {
      openBrowserUrl: async () => ({
        ok: false,
        browser: 'chromium',
        requestedUrl: 'https://example.test',
        errors: ['Playwright chromium is not installed; run `wp browser ensure chromium`.'],
        hint: 'Playwright chromium is not installed; run `wp browser ensure chromium`.',
        installCommand: 'wp browser ensure chromium',
      }),
    })

    await expect(cli.getAction()?.('open', 'https://example.test', {})).rejects.toMatchObject({
      exitCode: 1,
    })
    expect(stdout.join('\n')).toContain('Install: wp browser ensure chromium')
    expect(stdout.join('\n')).toContain('Errors:')
  })
})
