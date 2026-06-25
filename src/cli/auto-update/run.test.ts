/**
 * Tests for the auto-update orchestrator.
 *
 * `fetch` is mocked globally so the GitHub Releases API probe never hits the
 * network. `node:fs/promises` is mocked for cache read/write. `detect-pm`,
 * `installer`, `log`, and `skip` dependencies are mocked so each test
 * exercises one decision branch in isolation.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Module mocks (must be declared before any imports) ───────────────────────

vi.mock("node:fs/promises", async () => {
  const actual = await vi.importActual<typeof import("node:fs/promises")>("node:fs/promises");
  return { ...actual, readFile: vi.fn(), writeFile: vi.fn(), mkdir: vi.fn() };
});

vi.mock("./detect-pm.js", () => ({
  detect: vi.fn(),
}));

vi.mock("./installer.js", () => ({
  scheduleDeferredInstall: vi.fn(),
}));

vi.mock("./log.js", () => ({
  logUpdateError: vi.fn(),
}));

vi.mock("./skip.js", () => ({
  shouldSkipAutoInstall: vi.fn(),
}));

vi.mock("env-paths", () => ({
  default: () => ({
    data: "/fake/state",
    cache: "/fake/cache",
    log: "/fake/log",
    temp: "/fake/temp",
    config: "/fake/config",
  }),
}));

// ─── Imports (after vi.mock hoisting) ─────────────────────────────────────────

import { readFile, writeFile, mkdir } from "node:fs/promises";

import { _clearCacheForTests } from "#paths/state-root.js";

import { detect } from "./detect-pm.js";
import { scheduleDeferredInstall } from "./installer.js";
import { logUpdateError } from "./log.js";
import { fetchLatestRelease, runUpdateFlow } from "./run.js";
import { shouldSkipAutoInstall } from "./skip.js";

// ─── Typed mocks ──────────────────────────────────────────────────────────────

const readFileMock = vi.mocked(readFile);
const writeFileMock = vi.mocked(writeFile);
const mkdirMock = vi.mocked(mkdir);
const detectMock = vi.mocked(detect);
const scheduleDeferredInstallMock = vi.mocked(scheduleDeferredInstall);
const logUpdateErrorMock = vi.mocked(logUpdateError);
const shouldSkipAutoInstallMock = vi.mocked(shouldSkipAutoInstall);

// ─── Setup ────────────────────────────────────────────────────────────────────

const FRESH_CACHE = JSON.stringify({
  latest: "1.0.0",
  current: "1.0.0",
  lastUpdateCheck: Date.now() - 1000, // 1s ago — within 24h interval
});

beforeEach(() => {
  _clearCacheForTests();
  vi.resetAllMocks();
  shouldSkipAutoInstallMock.mockReturnValue(false);
  readFileMock.mockRejectedValue(Object.assign(new Error("ENOENT"), { code: "ENOENT" }));
  writeFileMock.mockResolvedValue(undefined);
  mkdirMock.mockResolvedValue(undefined);

  // Provide a token so fetchLatestRelease doesn't short-circuit to null
  vi.stubEnv("GH_PACKAGES_TOKEN", "test-token");
  vi.stubEnv("GITHUB_TOKEN", "");

  // Default fetch: returns no release
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
});

// ─── fetchLatestRelease unit tests ───────────────────────────────────────────

describe("fetchLatestRelease", () => {
  it("returns the version from dist-tags.latest", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ "dist-tags": { latest: "2.3.4" } }) }),
    );
    expect(await fetchLatestRelease()).toStrictEqual("2.3.4");
  });

  it("returns null when response is not ok", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    expect(await fetchLatestRelease()).toStrictEqual(null);
  });

  it("returns null when no token is available", async () => {
    vi.stubEnv("GH_PACKAGES_TOKEN", "");
    vi.stubEnv("GITHUB_TOKEN", "");
    expect(await fetchLatestRelease()).toStrictEqual(null);
  });

  it("returns null when dist-tags.latest is missing", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) }));
    expect(await fetchLatestRelease()).toStrictEqual(null);
  });

  it("propagates AbortError when the 5s deadline fires", async () => {
    const abortError = new DOMException("signal timed out", "TimeoutError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));
    await expect(fetchLatestRelease()).rejects.toThrow("signal timed out");
  });
});

// ─── runUpdateFlow — no update available ─────────────────────────────────────

describe("runUpdateFlow — no update available", () => {
  it("is a no-op when fetch returns the same version", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ "dist-tags": { latest: "1.0.0" } }) }),
    );
    await runUpdateFlow("1.0.0");
    expect(scheduleDeferredInstallMock).not.toHaveBeenCalled();
    expect(logUpdateErrorMock).not.toHaveBeenCalled();
  });

  it("is a no-op when fetch returns an older version", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ tag_name: "v0.9.0" }) }),
    );
    await runUpdateFlow("1.0.0");
    expect(scheduleDeferredInstallMock).not.toHaveBeenCalled();
    expect(logUpdateErrorMock).not.toHaveBeenCalled();
  });

  it("is a no-op when fetch returns null (API unavailable)", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false }));
    await runUpdateFlow("1.0.0");
    expect(scheduleDeferredInstallMock).not.toHaveBeenCalled();
    expect(logUpdateErrorMock).not.toHaveBeenCalled();
  });

  it("uses cache within 24h interval without re-fetching", async () => {
    readFileMock.mockResolvedValue(FRESH_CACHE as unknown as Uint8Array);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    await runUpdateFlow("1.0.0");

    expect(fetchSpy).not.toHaveBeenCalled();
    expect(scheduleDeferredInstallMock).not.toHaveBeenCalled();
  });

  it("ignores malformed cache JSON and refetches release metadata", async () => {
    readFileMock.mockResolvedValue(
      JSON.stringify({
        latest: "1.0.0",
        current: "1.0.0",
        lastUpdateCheck: "not-a-number",
      }) as unknown as Uint8Array,
    );
    const fetchSpy = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ "dist-tags": { latest: "1.0.0" } }) });
    vi.stubGlobal("fetch", fetchSpy);

    await runUpdateFlow("1.0.0");

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(scheduleDeferredInstallMock).not.toHaveBeenCalled();
  });
});

// ─── runUpdateFlow — update available + WP_SKIP_AUTO_INSTALL=1 ───────────────

describe("runUpdateFlow — update available + WP_SKIP_AUTO_INSTALL=1", () => {
  it("does not call scheduleDeferredInstall when auto-install is skipped", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ "dist-tags": { latest: "2.0.0" } }) }),
    );
    shouldSkipAutoInstallMock.mockReturnValue(true);

    await runUpdateFlow("1.0.0");

    expect(scheduleDeferredInstallMock).not.toHaveBeenCalled();
    expect(logUpdateErrorMock).not.toHaveBeenCalled();
  });
});

// ─── runUpdateFlow — update available + PM detected ──────────────────────────

describe("runUpdateFlow — update available + PM detected", () => {
  it("calls scheduleDeferredInstall with the detected command", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ "dist-tags": { latest: "2.0.0" } }) }),
    );
    detectMock.mockReturnValue({
      topology: "global-node",
      command: ["/global/bin/vp", "install", "-g", "@webpresso/agent-kit"],
    });

    await runUpdateFlow("1.0.0");

    expect(scheduleDeferredInstallMock).toHaveBeenCalledOnce();
    expect(scheduleDeferredInstallMock).toHaveBeenCalledWith({
      command: ["/global/bin/vp", "install", "-g", "@webpresso/agent-kit"],
    });
    expect(logUpdateErrorMock).not.toHaveBeenCalled();
  });
});

// ─── runUpdateFlow — update available + PM abort ─────────────────────────────

describe("runUpdateFlow — update available + PM abort", () => {
  it("calls logUpdateError with the abort reason, does not spawn", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ "dist-tags": { latest: "1.0.1" } }) }),
    );
    detectMock.mockReturnValue({ abort: "Unable to detect a package manager" });

    await runUpdateFlow("1.0.0");

    expect(scheduleDeferredInstallMock).not.toHaveBeenCalled();
    expect(logUpdateErrorMock).toHaveBeenCalledOnce();
    const errArg = logUpdateErrorMock.mock.calls[0]?.[0];
    expect(errArg).toBeInstanceOf(Error);
    expect((errArg as Error).message).toContain("Unable to detect a package manager");
  });
});

// ─── runUpdateFlow — fetch throws ────────────────────────────────────────────

describe("runUpdateFlow — fetch throws", () => {
  it("swallows the error via logUpdateError and resolves", async () => {
    const fetchError = new Error("network error");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(fetchError));

    await expect(runUpdateFlow("1.0.0")).resolves.toBeUndefined();

    expect(logUpdateErrorMock).toHaveBeenCalledOnce();
    expect(logUpdateErrorMock).toHaveBeenCalledWith(fetchError);
    expect(scheduleDeferredInstallMock).not.toHaveBeenCalled();
  });

  it("swallows AbortError (5s deadline) and resolves without installing", async () => {
    const abortError = new DOMException("signal timed out", "TimeoutError");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(abortError));

    await expect(runUpdateFlow("1.0.0")).resolves.toBeUndefined();

    expect(logUpdateErrorMock).toHaveBeenCalledOnce();
    expect(logUpdateErrorMock).toHaveBeenCalledWith(abortError);
    expect(scheduleDeferredInstallMock).not.toHaveBeenCalled();
  });
});

// ─── runUpdateFlow — cache write ─────────────────────────────────────────────

describe("runUpdateFlow — cache write", () => {
  it("writes cache after a successful fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue({ ok: true, json: async () => ({ "dist-tags": { latest: "1.0.0" } }) }),
    );
    detectMock.mockReturnValue({ abort: "no pm" });

    await runUpdateFlow("1.0.0");

    expect(writeFileMock).toHaveBeenCalledOnce();
    const [, content] = writeFileMock.mock.calls[0] as [string, string];
    const parsed = JSON.parse(content) as { latest: string; current: string };
    expect(parsed.latest).toStrictEqual("1.0.0");
    expect(parsed.current).toStrictEqual("1.0.0");
  });
});
