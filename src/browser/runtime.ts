import { spawnSync, type SpawnSyncReturns } from 'node:child_process'
import { existsSync } from 'node:fs'
import { createRequire } from 'node:module'
import { homedir, platform } from 'node:os'
import path from 'node:path'

export type BrowserName = 'chromium' | 'firefox' | 'webkit'

export interface BrowserDoctorResult {
  ok: boolean
  packageAvailable: boolean
  packageVersion?: string
  browser: BrowserName
  executablePath?: string
  executableExists: boolean
  cachePath: string
  hint?: string
  installCommand?: string
}

export interface BrowserOpenResult {
  ok: boolean
  browser: BrowserName
  requestedUrl: string
  finalUrl?: string
  status?: number
  title?: string
  errors: string[]
  hint?: string
  installCommand?: string
}

export interface BrowserInstallOptions {
  browser?: BrowserName
  run?: (command: string, args: readonly string[]) => SpawnSyncReturns<string>
}

const require = createRequire(import.meta.url)
const PLAYWRIGHT_TEST_PACKAGE = ['@playwright', 'test'].join('/')

export function browserInstallCommand(browser: BrowserName = 'chromium'): string {
  return `wp browser install ${browser}`
}

function defaultBrowserCachePath(): string {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH && process.env.PLAYWRIGHT_BROWSERS_PATH !== '0') {
    return process.env.PLAYWRIGHT_BROWSERS_PATH
  }
  switch (platform()) {
    case 'darwin':
      return path.join(homedir(), 'Library', 'Caches', 'ms-playwright')
    case 'win32':
      return path.join(
        process.env.LOCALAPPDATA ?? path.join(homedir(), 'AppData', 'Local'),
        'ms-playwright',
      )
    default:
      return path.join(homedir(), '.cache', 'ms-playwright')
  }
}

async function loadPlaywright(): Promise<null | Record<
  BrowserName,
  { executablePath: () => string; launch: (options: { headless: boolean }) => Promise<unknown> }
>> {
  try {
    return (await import(PLAYWRIGHT_TEST_PACKAGE)) as never
  } catch {
    return null
  }
}

export async function browserDoctor(
  browser: BrowserName = 'chromium',
): Promise<BrowserDoctorResult> {
  const playwright = await loadPlaywright()
  const cachePath = defaultBrowserCachePath()
  if (!playwright) {
    return {
      ok: false,
      packageAvailable: false,
      browser,
      executableExists: false,
      cachePath,
      hint: '@playwright/test is not installed; run `vp install` in this package or reinstall @webpresso/agent-kit with optional dependencies.',
    }
  }

  let packageVersion: string | undefined
  try {
    packageVersion = (require(`${PLAYWRIGHT_TEST_PACKAGE}/package.json`) as { version?: string })
      .version
  } catch {
    packageVersion = undefined
  }

  const executablePath = playwright[browser].executablePath()
  const executableExists = existsSync(executablePath)
  return {
    ok: executableExists,
    packageAvailable: true,
    ...(packageVersion ? { packageVersion } : {}),
    browser,
    executablePath,
    executableExists,
    cachePath,
    ...(executableExists
      ? {}
      : {
          hint: `Playwright ${browser} is not installed; run \`${browserInstallCommand(browser)}\`.`,
          installCommand: browserInstallCommand(browser),
        }),
  }
}

export function installBrowser(options: BrowserInstallOptions = {}): SpawnSyncReturns<string> {
  const browser = options.browser ?? 'chromium'
  const run = options.run ?? ((command, args) => spawnSync(command, args, { encoding: 'utf8' }))
  return run('npx', ['playwright', 'install', browser])
}

export async function openBrowserUrl(
  url: string,
  options: {
    browser?: BrowserName
    headless?: boolean
    doctor?: (browser: BrowserName) => Promise<BrowserDoctorResult>
  } = {},
): Promise<BrowserOpenResult> {
  const browserName = options.browser ?? 'chromium'
  const preflight = await (options.doctor ?? browserDoctor)(browserName)
  if (!preflight.ok) {
    return {
      ok: false,
      browser: browserName,
      requestedUrl: url,
      errors: [preflight.hint ?? `Playwright ${browserName} is not available.`],
      ...(preflight.hint ? { hint: preflight.hint } : {}),
      ...(preflight.installCommand ? { installCommand: preflight.installCommand } : {}),
    }
  }

  const playwright = await loadPlaywright()
  if (!playwright) {
    return {
      ok: false,
      browser: browserName,
      requestedUrl: url,
      errors: [
        '@playwright/test is not installed; run `vp install` or reinstall optional dependencies.',
      ],
    }
  }

  const errors: string[] = []
  const browser = (await playwright[browserName].launch({
    headless: options.headless ?? true,
  })) as {
    newPage: () => Promise<{
      on: (event: string, listener: (...args: never[]) => void) => void
      goto: (
        url: string,
        options: { waitUntil: 'domcontentloaded' },
      ) => Promise<{ status: () => number } | null>
      title: () => Promise<string>
      url: () => string
    }>
    close: () => Promise<void>
  }
  try {
    const page = await browser.newPage()
    page.on('console', (message: { type?: () => string; text?: () => string }) => {
      if (message.type?.() === 'error') errors.push(message.text?.() ?? 'console error')
    })
    page.on('pageerror', (error: Error) => errors.push(error.message))
    const response = await page.goto(url, { waitUntil: 'domcontentloaded' })
    const title = await page.title()
    return {
      ok: true,
      browser: browserName,
      requestedUrl: url,
      finalUrl: page.url(),
      status: response?.status(),
      title,
      errors,
    }
  } catch (error) {
    return {
      ok: false,
      browser: browserName,
      requestedUrl: url,
      errors: [error instanceof Error ? error.message : String(error)],
    }
  } finally {
    await browser.close()
  }
}
