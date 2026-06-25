import { spawnSync, type SpawnSyncReturns } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir, platform } from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

import { getManagedRunner } from "#tool-runtime";

export type BrowserName = "chromium" | "firefox" | "webkit";

export interface BrowserDoctorResult {
  ok: boolean;
  packageAvailable: boolean;
  packageVersion?: string;
  browser: BrowserName;
  executablePath?: string;
  executableExists: boolean;
  cachePath: string;
  hint?: string;
  installCommand?: string;
}

export interface BrowserOpenResult {
  ok: boolean;
  browser: BrowserName;
  requestedUrl: string;
  finalUrl?: string;
  status?: number;
  title?: string;
  errors: string[];
  hint?: string;
  installCommand?: string;
}

export interface BrowserInstallOptions {
  browser?: BrowserName;
  run?: (command: string, args: readonly string[]) => SpawnSyncReturns<string>;
}

export interface BrowserEnsureOptions {
  browser?: BrowserName;
  doctor?: (browser: BrowserName) => Promise<BrowserDoctorResult>;
  install?: (options: BrowserInstallOptions) => SpawnSyncReturns<string>;
  run?: (command: string, args: readonly string[]) => SpawnSyncReturns<string>;
}

export interface BrowserEnsureResult {
  ok: boolean;
  browser: BrowserName;
  alreadyInstalled: boolean;
  installed: boolean;
  doctor: BrowserDoctorResult;
  installResult?: {
    status: number | null;
    signal: NodeJS.Signals | null;
    stdout: string;
    stderr: string;
  };
  errors: string[];
  installCommand: string;
}

const require = createRequire(import.meta.url);
const PLAYWRIGHT_TEST_PACKAGE = ["@playwright", "test"].join("/");

export function browserEnsureCommand(browser: BrowserName = "chromium"): string {
  return `wp browser ensure ${browser}`;
}

function managedPlaywrightInstallCommand(browser: BrowserName): {
  command: string;
  args: readonly string[];
} {
  const runner = getManagedRunner("playwright", { outputPolicy: "structured" });
  return { command: runner.command, args: [...runner.args, "install", browser] };
}

function commandToString(command: string, args: readonly string[]): string {
  return [command, ...args].join(" ");
}

function defaultBrowserCachePath(): string {
  if (process.env.PLAYWRIGHT_BROWSERS_PATH && process.env.PLAYWRIGHT_BROWSERS_PATH !== "0") {
    return process.env.PLAYWRIGHT_BROWSERS_PATH;
  }
  switch (platform()) {
    case "darwin":
      return path.join(homedir(), "Library", "Caches", "ms-playwright");
    case "win32":
      return path.join(
        process.env.LOCALAPPDATA ?? path.join(homedir(), "AppData", "Local"),
        "ms-playwright",
      );
    default:
      return path.join(homedir(), ".cache", "ms-playwright");
  }
}

async function loadPlaywright(): Promise<null | Record<
  BrowserName,
  { executablePath: () => string; launch: (options: { headless: boolean }) => Promise<unknown> }
>> {
  try {
    return (await import(PLAYWRIGHT_TEST_PACKAGE)) as never;
  } catch {
    return null;
  }
}

export async function browserDoctor(
  browser: BrowserName = "chromium",
): Promise<BrowserDoctorResult> {
  const playwright = await loadPlaywright();
  const cachePath = defaultBrowserCachePath();
  if (!playwright) {
    return {
      ok: false,
      packageAvailable: false,
      browser,
      executableExists: false,
      cachePath,
      hint: "@playwright/test is not installed; run `vp install` in this package or reinstall @webpresso/agent-kit with optional dependencies.",
    };
  }

  let packageVersion: string | undefined;
  try {
    packageVersion = (require(`${PLAYWRIGHT_TEST_PACKAGE}/package.json`) as { version?: string })
      .version;
  } catch {
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

export function installBrowser(options: BrowserInstallOptions = {}): SpawnSyncReturns<string> {
  const browser = options.browser ?? "chromium";
  const run = options.run ?? ((command, args) => spawnSync(command, args, { encoding: "utf8" }));
  const install = managedPlaywrightInstallCommand(browser);
  return run(install.command, install.args);
}

export async function ensureBrowser(
  options: BrowserEnsureOptions = {},
): Promise<BrowserEnsureResult> {
  const browser = options.browser ?? "chromium";
  const doctor = options.doctor ?? browserDoctor;
  const install =
    options.install ?? ((installOptions: BrowserInstallOptions) => installBrowser(installOptions));
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
      errors: [before.hint ?? "@playwright/test is not installed."],
      installCommand,
    };
  }

  const installResult = install({ browser, run: options.run });
  const normalizedInstallResult = {
    status: installResult.status,
    signal: installResult.signal,
    stdout: installResult.stdout ?? "",
    stderr: installResult.stderr ?? "",
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
        `Failed to install Playwright ${browser} with \`${commandToString(
          managed.command,
          managed.args,
        )}\`; rerun \`${installCommand}\` after fixing the install error.`,
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

export async function openBrowserUrl(
  url: string,
  options: {
    browser?: BrowserName;
    headless?: boolean;
    doctor?: (browser: BrowserName) => Promise<BrowserDoctorResult>;
  } = {},
): Promise<BrowserOpenResult> {
  const browserName = options.browser ?? "chromium";
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
        "@playwright/test is not installed; run `vp install` or reinstall optional dependencies.",
      ],
    };
  }

  const errors: string[] = [];
  const browser = (await playwright[browserName].launch({
    headless: options.headless ?? true,
  })) as {
    newPage: () => Promise<{
      on: (event: string, listener: (...args: never[]) => void) => void;
      goto: (
        url: string,
        options: { waitUntil: "domcontentloaded" },
      ) => Promise<{ status: () => number } | null>;
      title: () => Promise<string>;
      url: () => string;
    }>;
    close: () => Promise<void>;
  };
  try {
    const page = await browser.newPage();
    page.on("console", (message: { type?: () => string; text?: () => string }) => {
      if (message.type?.() === "error") errors.push(message.text?.() ?? "console error");
    });
    page.on("pageerror", (error: Error) => errors.push(error.message));
    const response = await page.goto(url, { waitUntil: "domcontentloaded" });
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
  } catch (error) {
    return {
      ok: false,
      browser: browserName,
      requestedUrl: url,
      errors: [error instanceof Error ? error.message : String(error)],
    };
  } finally {
    await browser.close();
  }
}
