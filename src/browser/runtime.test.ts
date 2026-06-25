import { describe, expect, it, vi } from "vitest";

import { installManagedRunnerHermeticHooks } from "#test-helpers/managed-runner";
import { getManagedRunner } from "#tool-runtime";

import {
  ensureBrowser,
  installBrowser,
  openBrowserUrl,
  type BrowserDoctorResult,
  type BrowserName,
} from "./runtime.js";

installManagedRunnerHermeticHooks();

function spawnResult(overrides: { status?: number | null; stderr?: string } = {}) {
  return {
    status: overrides.status ?? 0,
    signal: null,
    output: [],
    pid: 1,
    stdout: "",
    stderr: overrides.stderr ?? "",
  };
}

function doctorResult(
  overrides: Partial<BrowserDoctorResult> = {},
  browser: BrowserName = "chromium",
): BrowserDoctorResult {
  return {
    ok: true,
    packageAvailable: true,
    packageVersion: "1.60.0",
    browser,
    executablePath: `/cache/${browser}/browser`,
    executableExists: true,
    cachePath: "/cache/ms-playwright",
    ...overrides,
  };
}

describe("browser runtime", () => {
  it("installs chromium through the managed Playwright runner by default", () => {
    const run = vi.fn(() => spawnResult());

    expect(installBrowser({ run }).status).toBe(0);
    expect(run).toHaveBeenCalledWith(expect.stringContaining("playwright"), [
      "install",
      "chromium",
    ]);
    expect(run).not.toHaveBeenCalledWith("npx", expect.anything());
  });

  it("allows selecting another Playwright browser", () => {
    const run = vi.fn(() => spawnResult());

    const runner = getManagedRunner("playwright", { outputPolicy: "structured" });

    installBrowser({ browser: "firefox", run });

    expect(run).toHaveBeenCalledWith(runner.command, [...runner.args, "install", "firefox"]);
  });

  it("ensure skips installation when the browser is already installed", async () => {
    const doctor = vi.fn(async () => doctorResult());
    const install = vi.fn(() => spawnResult());

    await expect(ensureBrowser({ browser: "chromium", doctor, install })).resolves.toMatchObject({
      ok: true,
      alreadyInstalled: true,
      installed: false,
      installCommand: "wp browser ensure chromium",
    });
    expect(doctor).toHaveBeenCalledTimes(1);
    expect(install).not.toHaveBeenCalled();
  });

  it("ensure installs once and rechecks when the browser is missing", async () => {
    const doctor = vi
      .fn<() => Promise<BrowserDoctorResult>>()
      .mockResolvedValueOnce(
        doctorResult({
          ok: false,
          executableExists: false,
          executablePath: "/cache/chromium/missing",
          hint: "missing",
          installCommand: "wp browser ensure chromium",
        }),
      )
      .mockResolvedValueOnce(doctorResult());
    const install = vi.fn(() => spawnResult());

    await expect(ensureBrowser({ browser: "chromium", doctor, install })).resolves.toMatchObject({
      ok: true,
      alreadyInstalled: false,
      installed: true,
      installCommand: "wp browser ensure chromium",
    });
    expect(install).toHaveBeenCalledTimes(1);
    expect(install).toHaveBeenCalledWith({ browser: "chromium", run: undefined });
    expect(doctor).toHaveBeenCalledTimes(2);
  });

  it("ensure returns an actionable error when install fails", async () => {
    const doctor = vi.fn(async () =>
      doctorResult({
        ok: false,
        executableExists: false,
        hint: "missing",
        installCommand: "wp browser ensure chromium",
      }),
    );
    const install = vi.fn(() => spawnResult({ status: 1, stderr: "download failed" }));

    await expect(ensureBrowser({ doctor, install })).resolves.toMatchObject({
      ok: false,
      alreadyInstalled: false,
      installed: false,
      installCommand: "wp browser ensure chromium",
      errors: [expect.stringContaining("wp browser ensure chromium")],
    });
    expect(doctor).toHaveBeenCalledTimes(1);
    expect(install).toHaveBeenCalledTimes(1);
  });

  it("open preflights browser availability and returns the ensure command", async () => {
    await expect(
      openBrowserUrl("https://example.test", {
        doctor: async () =>
          doctorResult({
            ok: false,
            executableExists: false,
            hint: "Playwright chromium is not installed; run `wp browser ensure chromium`.",
            installCommand: "wp browser ensure chromium",
          }),
      }),
    ).resolves.toMatchObject({
      ok: false,
      browser: "chromium",
      requestedUrl: "https://example.test",
      installCommand: "wp browser ensure chromium",
      errors: [expect.stringContaining("wp browser ensure chromium")],
    });
  });
});
