import type { CAC } from 'cac'

import {
  browserDoctor,
  ensureBrowser,
  installBrowser,
  openBrowserUrl,
  type BrowserName,
  type BrowserDoctorResult,
  type BrowserEnsureResult,
  type BrowserInstallOptions,
  type BrowserOpenResult,
} from '#browser/runtime.js'

export const BROWSER_COMMAND_HELP = 'Browser runtime helpers (doctor, ensure, install, open)'

type BrowserAction = 'doctor' | 'ensure' | 'install' | 'open'

export interface BrowserCommandDependencies {
  browserDoctor?: typeof browserDoctor
  ensureBrowser?: typeof ensureBrowser
  installBrowser?: (options: BrowserInstallOptions) => { status: number | null }
  openBrowserUrl?: typeof openBrowserUrl
}

function parseBrowser(value: unknown): BrowserName {
  return value === 'firefox' || value === 'webkit' || value === 'chromium' ? value : 'chromium'
}

function printJson(value: unknown): void {
  console.log(JSON.stringify(value, null, 2))
}

function printDoctor(result: BrowserDoctorResult): void {
  console.log(
    `Playwright package: ${result.packageAvailable ? `✓ ${result.packageVersion ?? 'installed'}` : '✗ missing'}`,
  )
  console.log(`Browser: ${result.browser}`)
  console.log(`Executable: ${result.executableExists ? `✓ ${result.executablePath}` : '✗ missing'}`)
  console.log(`Cache: ${result.cachePath}`)
  if (result.installCommand) console.log(`Install: ${result.installCommand}`)
  if (result.hint) console.log(`Hint: ${result.hint}`)
}

function printEnsure(result: BrowserEnsureResult): void {
  if (result.alreadyInstalled) {
    console.log(`Playwright ${result.browser} already installed.`)
    return
  }
  if (result.ok) {
    console.log(`Playwright ${result.browser} installed.`)
    return
  }
  console.log(`Playwright ${result.browser} is not installed.`)
  console.log(`Install: ${result.installCommand}`)
  for (const error of result.errors) console.log(`Error: ${error}`)
}

function printOpen(result: BrowserOpenResult): void {
  console.log(`Browser: ${result.browser}`)
  console.log(`URL: ${result.finalUrl ?? result.requestedUrl}`)
  if (result.status !== undefined) console.log(`Status: ${result.status}`)
  if (result.title !== undefined) console.log(`Title: ${result.title}`)
  if (result.installCommand) console.log(`Install: ${result.installCommand}`)
  if (result.hint) console.log(`Hint: ${result.hint}`)
  if (result.errors.length > 0) {
    console.log('Errors:')
    for (const error of result.errors) console.log(`  - ${error}`)
  }
}

function throwExit(message: string, exitCode: number): never {
  const error = new Error(message) as Error & { exitCode: number }
  error.exitCode = exitCode
  throw error
}

export function registerBrowserCommand(
  cli: CAC,
  dependencies: BrowserCommandDependencies = {},
): void {
  const runDoctor = dependencies.browserDoctor ?? browserDoctor
  const runEnsure = dependencies.ensureBrowser ?? ensureBrowser
  const runInstall = dependencies.installBrowser ?? installBrowser
  const runOpen = dependencies.openBrowserUrl ?? openBrowserUrl
  cli
    .command('browser <action> [target]', BROWSER_COMMAND_HELP)
    .option('--browser <browser>', 'Browser engine: chromium, firefox, webkit')
    .option('--headed', 'Run headed instead of headless for `browser open`')
    .option('--json', 'Print machine-readable JSON for `doctor`, `ensure`, and `open`')
    .action(
      async (
        action: string,
        target: string | undefined,
        flags: { browser?: string; headed?: boolean; json?: boolean },
      ) => {
        if (action === 'doctor') {
          const result = await runDoctor(parseBrowser(flags.browser))
          if (flags.json) printJson(result)
          else printDoctor(result)
          if (!result.ok) throwExit('browser doctor failed', 1)
          return 0
        }

        if (action === 'ensure') {
          const result = await runEnsure({ browser: parseBrowser(target ?? flags.browser) })
          if (flags.json) printJson(result)
          else printEnsure(result)
          if (!result.ok) throwExit('browser ensure failed', 1)
          return 0
        }

        if (action === 'install') {
          const result = runInstall({ browser: parseBrowser(target ?? flags.browser) })
          return typeof result.status === 'number' ? result.status : 1
        }

        if (action === 'open') {
          if (!target) throwExit('browser open requires a URL', 1)
          const result = await runOpen(target, {
            browser: parseBrowser(flags.browser),
            headless: flags.headed !== true,
          })
          if (flags.json) printJson(result)
          else printOpen(result)
          if (!result.ok) throwExit('browser open failed', 1)
          return 0
        }

        throwExit(`unknown browser action: ${action as BrowserAction}`, 1)
      },
    )
}
