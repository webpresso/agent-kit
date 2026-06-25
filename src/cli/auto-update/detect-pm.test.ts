/**
 * Tests for install-topology detection.
 *
 * `realpathSync` is mocked to feed synthetic argv0 paths through the algorithm.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", async () => {
  const actual = await vi.importActual<typeof import("node:fs")>("node:fs");
  return {
    ...actual,
    realpathSync: vi.fn(),
  };
});

import { realpathSync } from "node:fs";

import {
  buildNpmGlobalInstallCommand,
  buildVpGlobalInstallCommand,
  confirmInstalledGlobally,
  detect,
  detectShim,
  formatLegacyCommandReplacementMessage,
  matchStoreMarker,
  parseUserAgent,
} from "./detect-pm.js";

const realpathSyncMock = vi.mocked(realpathSync);

beforeEach(() => {
  realpathSyncMock.mockReset();
  realpathSyncMock.mockImplementation((p) => String(p));
});

describe("buildVpGlobalInstallCommand", () => {
  it("returns the canonical Vite+ global-install command", () => {
    expect(buildVpGlobalInstallCommand()).toStrictEqual([
      "vp",
      "install",
      "-g",
      "@webpresso/agent-kit",
    ]);
  });

  it("wraps Windows command-script vp launch plans before appending install args", () => {
    expect(
      buildVpGlobalInstallCommand({
        command: "C:\\Windows\\cmd.exe",
        argsPrefix: ["/d", "/s", "/c", "C:\\Users\\me\\.vite-plus\\bin\\vp.cmd"],
        executable: "C:\\Users\\me\\.vite-plus\\bin\\vp.cmd",
      }),
    ).toStrictEqual([
      "C:\\Windows\\cmd.exe",
      "/d",
      "/s",
      "/c",
      "C:\\Users\\me\\.vite-plus\\bin\\vp.cmd",
      "install",
      "-g",
      "@webpresso/agent-kit",
    ]);
  });

  it("is the absolute command surfaced by detect() for a Vite+ install", () => {
    realpathSyncMock.mockReturnValue(
      "/Users/me/.vite-plus/packages/@webpresso/agent-kit/lib/node_modules/@webpresso/agent-kit/bin/wp",
    );
    const result = detect(
      { npm_config_user_agent: "vp/0.1.24 node/v24" },
      "/path/to/wp",
      () => "/Users/me/.vite-plus/bin/vp",
    );
    expect(result).toStrictEqual({
      topology: "vp",
      command: buildVpGlobalInstallCommand("/Users/me/.vite-plus/bin/vp"),
    });
  });

  it("aborts a Vite+ install when neither bundled nor global vp can be resolved", () => {
    realpathSyncMock.mockReturnValue(
      "/Users/me/.vite-plus/packages/@webpresso/agent-kit/lib/node_modules/@webpresso/agent-kit/bin/wp",
    );
    const result = detect(
      { npm_config_user_agent: "vp/0.1.24 node/v24" },
      "/path/to/wp",
      () => null,
    );
    expect(result).toStrictEqual({
      abort: expect.stringContaining("Unable to resolve the bundled Vite+ runner"),
    });
  });
});

describe("buildNpmGlobalInstallCommand", () => {
  it("returns the canonical npm global-install command", () => {
    expect(buildNpmGlobalInstallCommand()).toStrictEqual([
      "npm",
      "install",
      "-g",
      "@webpresso/agent-kit",
    ]);
  });
});

describe("parseUserAgent", () => {
  it("detects vp", () => {
    expect(parseUserAgent("vp/0.1.24 node/v24.17.0 darwin arm64")).toStrictEqual("vp");
  });

  it("detects npm", () => {
    expect(parseUserAgent("npm/10.2.4 node/v22.0.0 darwin x64")).toStrictEqual("npm");
  });

  it("ignores unsupported package managers", () => {
    expect(parseUserAgent("pnpm/10.33.0 npm/? node/v22.0.0 darwin arm64")).toStrictEqual(null);
    expect(parseUserAgent("yarn/1.22.22 npm/? node/v22.0.0 darwin arm64")).toStrictEqual(null);
    expect(parseUserAgent("bun/1.1.0 npm/? node/v22.0.0 darwin arm64")).toStrictEqual(null);
  });

  it("returns null for unknown or empty user-agents", () => {
    expect(parseUserAgent("rush/5.0 node/v22.0.0")).toStrictEqual(null);
    expect(parseUserAgent("")).toStrictEqual(null);
    expect(parseUserAgent("   ")).toStrictEqual(null);
  });
});

describe("matchStoreMarker", () => {
  it("detects Vite+ via .vite-plus segment", () => {
    expect(
      matchStoreMarker("/Users/me/.vite-plus/packages/webpresso/current/bin/wp"),
    ).toStrictEqual("vp");
  });

  it("detects npm global node_modules installs", () => {
    expect(matchStoreMarker("/usr/local/lib/node_modules/@webpresso/agent-kit")).toStrictEqual(
      "npm",
    );
  });

  it("returns null for legacy/local stores", () => {
    expect(matchStoreMarker("/Users/me/.pnpm-store/v3/foo/@webpresso/agent-kit")).toStrictEqual(
      null,
    );
    expect(matchStoreMarker("/tmp/foo/bar/@webpresso/agent-kit")).toStrictEqual(null);
  });
});

describe("detectShim", () => {
  it("turns unsupported global managers into npm reinstall guidance", () => {
    expect(
      detectShim("/Users/me/.volta/tools/image/packages/@webpresso/agent-kit/bin/cli.js"),
    ).toMatch(/vp install -g @webpresso\/agent-kit/);
    expect(detectShim("/opt/homebrew/Cellar/agent-kit/bin/wp")).toMatch(/Homebrew/);
  });

  it("returns null for supported global paths", () => {
    expect(detectShim("/Users/me/.vite-plus/packages/@webpresso/agent-kit/bin/wp")).toStrictEqual(
      null,
    );
    expect(detectShim("/usr/local/lib/node_modules/@webpresso/agent-kit/bin/wp")).toStrictEqual(
      null,
    );
  });
});

describe("confirmInstalledGlobally", () => {
  it("accepts supported global installs", () => {
    expect(
      confirmInstalledGlobally("/Users/me/.vite-plus/packages/@webpresso/agent-kit/bin/wp", {}),
    ).toBe(true);
    expect(
      confirmInstalledGlobally("/usr/local/lib/node_modules/@webpresso/agent-kit/bin/wp", {}),
    ).toBe(true);
    expect(
      confirmInstalledGlobally("/Users/me/proj/node_modules/@webpresso/agent-kit/bin/wp", {}),
    ).toBe(false);
  });
});

describe("formatLegacyCommandReplacementMessage", () => {
  it("maps stale setup, sync, audit, docs, skills, hooks, test, e2e, and tech-debt commands", () => {
    expect(formatLegacyCommandReplacementMessage("wp setup")).toContain("`webpresso agent setup`");
    expect(formatLegacyCommandReplacementMessage("wp sync")).toContain("`webpresso agent sync`");
    expect(formatLegacyCommandReplacementMessage("wp audit")).toContain("`webpresso agent audit`");
    expect(formatLegacyCommandReplacementMessage("wp docs lint")).toContain(
      "`webpresso agent docs lint`",
    );
    expect(formatLegacyCommandReplacementMessage("wp skill")).toContain("`webpresso agent skills`");
    expect(formatLegacyCommandReplacementMessage("wp hooks doctor")).toContain(
      "`webpresso agent hooks doctor`",
    );
    expect(formatLegacyCommandReplacementMessage("wp test")).toContain("`webpresso agent test`");
    expect(formatLegacyCommandReplacementMessage("wp e2e")).toContain("`webpresso agent e2e`");
    expect(formatLegacyCommandReplacementMessage("wp tech-debt")).toContain(
      "`webpresso agent tech-debt`",
    );
  });

  it("returns null for commands without a known replacement", () => {
    expect(formatLegacyCommandReplacementMessage("wp mystery")).toBeNull();
  });
});

describe("detect", () => {
  it("detects Vite+ from the resolved path", () => {
    realpathSyncMock.mockReturnValue("/Users/me/.vite-plus/packages/@webpresso/agent-kit/bin/wp");
    expect(detect({}, "/Users/me/.vite-plus/bin/wp", () => "/global/bin/vp")).toStrictEqual({
      topology: "vp",
      command: ["/global/bin/vp", "install", "-g", "@webpresso/agent-kit"],
    });
  });

  it("detects Vite+ from the user-agent after realpath succeeds", () => {
    realpathSyncMock.mockReturnValue("/Users/me/.local/bin/wp");
    expect(
      detect(
        { npm_config_user_agent: "vp/0.1.24 node/v24" },
        "/Users/me/.local/bin/wp",
        () => "/global/bin/vp",
      ),
    ).toStrictEqual({
      topology: "vp",
      command: ["/global/bin/vp", "install", "-g", "@webpresso/agent-kit"],
    });
  });

  it("aborts for project-local node_modules installs", () => {
    realpathSyncMock.mockReturnValue("/Users/me/proj/node_modules/@webpresso/agent-kit/bin/wp");
    const result = detect({}, "/Users/me/proj/node_modules/.bin/wp");
    expect("abort" in result).toBe(true);
    if ("abort" in result) expect(result.abort).toContain("project-local node_modules");
  });

  it("detects npm global installs", () => {
    realpathSyncMock.mockReturnValue("/usr/local/lib/node_modules/@webpresso/agent-kit/bin/wp");
    expect(detect({}, "/usr/local/bin/wp")).toStrictEqual({
      topology: "npm",
      command: ["npm", "install", "-g", "@webpresso/agent-kit"],
    });
  });

  it("aborts in explicit source mode", () => {
    realpathSyncMock.mockReturnValue("/Users/me/repos/webpresso/agent-kit/bin/wp");
    const result = detect({ WP_FORCE_SOURCE: "1" }, "/Users/me/repos/webpresso/agent-kit/bin/wp");
    expect(result).toStrictEqual({
      abort:
        "WP_FORCE_SOURCE=1 is enabled; source-mode development is explicit and auto-install is disabled.",
    });
  });

  it("aborts gracefully when realpathSync throws", () => {
    realpathSyncMock.mockImplementation(() => {
      throw new Error("ENOENT");
    });
    const result = detect({}, "/missing/path");
    expect("abort" in result).toBe(true);
  });
});
