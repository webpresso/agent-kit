import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir, platform } from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { getManagedRunner } from '#tool-runtime';
const require = createRequire(import.meta.url);
const PLAYWRIGHT_TEST_PACKAGE = ['@playwright', 'test'].join('/');
export function browserEnsureCommand(browser = 'chromium') {
    return `wp browser ensure ${browser}`;
}
function managedPlaywrightInstallCommand(browser) {
    const runner = getManagedRunner('playwright', { outputPolicy: 'structured' });
    return { command: runner.command, args: [...runner.args, 'install', browser] };
}
function commandToString(command, args) {
    return [command, ...args].join(' ');
}
function defaultBrowserCachePath() {
    if (process.env.PLAYWRIGHT_BROWSERS_PATH && process.env.PLAYWRIGHT_BROWSERS_PATH !== '0') {
        return process.env.PLAYWRIGHT_BROWSERS_PATH;
    }
    switch (platform()) {
        case 'darwin':
            return path.join(homedir(), 'Library', 'Caches', 'ms-playwright');
        case 'win32':
            return path.join(process.env.LOCALAPPDATA ?? path.join(homedir(), 'AppData', 'Local'), 'ms-playwright');
        default:
            return path.join(homedir(), '.cache', 'ms-playwright');
    }
}
async function loadPlaywright() {
    try {
        return (await import(PLAYWRIGHT_TEST_PACKAGE));
    }
    catch {
        return null;
    }
}
export async function browserDoctor(browser = 'chromium') {
    const playwright = await loadPlaywright();
    const cachePath = defaultBrowserCachePath();
    if (!playwright) {
        return {
            ok: false,
            packageAvailable: false,
            browser,
            executableExists: false,
            cachePath,
            hint: '@playwright/test is not installed; run `vp install` in this package or reinstall @webpresso/agent-kit with optional dependencies.',
        };
    }
    let packageVersion;
    try {
        packageVersion = require(`${PLAYWRIGHT_TEST_PACKAGE}/package.json`)
            .version;
    }
    catch {
        packageVersion = undefined;
    }
    const executablePath = playwright[browser].executablePath();
    const executableExists = existsSync(executablePath);
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
                hint: `Playwright ${browser} is not installed; run \`${browserEnsureCommand(browser)}\`.`,
                installCommand: browserEnsureCommand(browser),
            }),
    };
}
export function installBrowser(options = {}) {
    const browser = options.browser ?? 'chromium';
    const run = options.run ?? ((command, args) => spawnSync(command, args, { encoding: 'utf8' }));
    const install = managedPlaywrightInstallCommand(browser);
    return run(install.command, install.args);
}
export async function ensureBrowser(options = {}) {
    const browser = options.browser ?? 'chromium';
    const doctor = options.doctor ?? browserDoctor;
    const install = options.install ?? ((installOptions) => installBrowser(installOptions));
    const installCommand = browserEnsureCommand(browser);
    const before = await doctor(browser);
    if (before.ok) {
        return {
            ok: true,
            browser,
            alreadyInstalled: true,
            installed: false,
            doctor: before,
            errors: [],
            installCommand,
        };
    }
    if (!before.packageAvailable) {
        return {
            ok: false,
            browser,
            alreadyInstalled: false,
            installed: false,
            doctor: before,
            errors: [before.hint ?? '@playwright/test is not installed.'],
            installCommand,
        };
    }
    const installResult = install({ browser, run: options.run });
    const normalizedInstallResult = {
        status: installResult.status,
        signal: installResult.signal,
        stdout: installResult.stdout ?? '',
        stderr: installResult.stderr ?? '',
    };
    if (installResult.status !== 0) {
        const managed = managedPlaywrightInstallCommand(browser);
        return {
            ok: false,
            browser,
            alreadyInstalled: false,
            installed: false,
            doctor: before,
            installResult: normalizedInstallResult,
            errors: [
                `Failed to install Playwright ${browser} with \`${commandToString(managed.command, managed.args)}\`; rerun \`${installCommand}\` after fixing the install error.`,
            ],
            installCommand,
        };
    }
    const after = await doctor(browser);
    if (!after.ok) {
        return {
            ok: false,
            browser,
            alreadyInstalled: false,
            installed: true,
            doctor: after,
            installResult: normalizedInstallResult,
            errors: [
                after.hint ??
                    `Playwright ${browser} is still missing after install; rerun \`${installCommand}\`.`,
            ],
            installCommand,
        };
    }
    return {
        ok: true,
        browser,
        alreadyInstalled: false,
        installed: true,
        doctor: after,
        installResult: normalizedInstallResult,
        errors: [],
        installCommand,
    };
}
export async function openBrowserUrl(url, options = {}) {
    const browserName = options.browser ?? 'chromium';
    const preflight = await (options.doctor ?? browserDoctor)(browserName);
    if (!preflight.ok) {
        return {
            ok: false,
            browser: browserName,
            requestedUrl: url,
            errors: [preflight.hint ?? `Playwright ${browserName} is not available.`],
            ...(preflight.hint ? { hint: preflight.hint } : {}),
            ...(preflight.installCommand ? { installCommand: preflight.installCommand } : {}),
        };
    }
    const playwright = await loadPlaywright();
    if (!playwright) {
        return {
            ok: false,
            browser: browserName,
            requestedUrl: url,
            errors: [
                '@playwright/test is not installed; run `vp install` or reinstall optional dependencies.',
            ],
        };
    }
    const errors = [];
    const browser = (await playwright[browserName].launch({
        headless: options.headless ?? true,
    }));
    try {
        const page = await browser.newPage();
        page.on('console', (message) => {
            if (message.type?.() === 'error')
                errors.push(message.text?.() ?? 'console error');
        });
        page.on('pageerror', (error) => errors.push(error.message));
        const response = await page.goto(url, { waitUntil: 'domcontentloaded' });
        const title = await page.title();
        return {
            ok: true,
            browser: browserName,
            requestedUrl: url,
            finalUrl: page.url(),
            status: response?.status(),
            title,
            errors,
        };
    }
    catch (error) {
        return {
            ok: false,
            browser: browserName,
            requestedUrl: url,
            errors: [error instanceof Error ? error.message : String(error)],
        };
    }
    finally {
        await browser.close();
    }
}
//# sourceMappingURL=runtime.js.map