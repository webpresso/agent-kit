import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

const SCRIPT_PATH = "scripts/check-dependency-freshness.ts";

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}

function runCheck(root: string, extraEnv: Record<string, string> = {}): string {
  return execFileSync("bun", [SCRIPT_PATH, "--root", root], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      WP_DEPS_FRESHNESS_OUTDATED_JSON: join(root, "outdated.json"),
      WP_DEPS_FRESHNESS_PNPM_LATEST: "11.9.0",
      WP_DEPS_FRESHNESS_TODAY: "2026-06-28T00:00:00.000Z",
      ...extraEnv,
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
}

describe("check-dependency-freshness", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "wp-deps-freshness-"));
    mkdirSync(root, { recursive: true });
    writeJson(join(root, "package.json"), {
      name: "fixture",
      packageManager: "pnpm@11.9.0",
    });
    writeJson(join(root, "outdated.json"), {});
  });

  afterEach(() => {
    rmSync(root, { force: true, recursive: true });
  });

  it("passes when declared dependency surfaces and packageManager are current", () => {
    writeJson(join(root, "outdated.json"), {
      vite: {
        wanted: "8.1.0",
        latest: "8.1.0",
        dependencyType: "devDependencies",
        dependentPackages: [{ name: "fixture", location: root }],
      },
    });

    expect(runCheck(root)).toContain("OK: declared dependencies and packageManager are current");
  });

  it("fails on synthetic pnpm outdated JSON drift", () => {
    writeJson(join(root, "outdated.json"), {
      vite: {
        wanted: "8.0.14",
        latest: "8.1.0",
        dependencyType: "devDependencies",
        dependentPackages: [{ name: "fixture", location: root }],
      },
    });

    expect(() => runCheck(root)).toThrow(/vite is behind latest: wanted 8\.0\.14, latest 8\.1\.0/);
  });

  it("fails when packageManager is behind latest pnpm", () => {
    writeJson(join(root, "package.json"), {
      name: "fixture",
      packageManager: "pnpm@11.1.1",
    });

    expect(() => runCheck(root)).toThrow(
      /packageManager is behind latest: pnpm@11\.1\.1, latest pnpm@11\.9\.0/,
    );
  });

  it("requires complete exception metadata before allowing declared drift", () => {
    writeJson(join(root, "package.json"), {
      name: "fixture",
      packageManager: "pnpm@11.9.0",
      dependencyFreshnessExceptions: [
        {
          package: "vite",
          reason: "blocked by upstream regression",
          owner: "@webpresso/agent-kit",
          expiry: "2026-07-15",
        },
      ],
    });
    writeJson(join(root, "outdated.json"), {
      vite: { wanted: "8.0.14", latest: "8.1.0", dependencyType: "devDependencies" },
    });

    expect(() => runCheck(root)).toThrow(
      /dependencyFreshnessExceptions\[0\] is missing linkedIssue/,
    );
  });

  it("allows declared drift only when a complete unexpired exception exists", () => {
    writeJson(join(root, "package.json"), {
      name: "fixture",
      packageManager: "pnpm@11.9.0",
      dependencyFreshnessExceptions: [
        {
          package: "vite",
          reason: "blocked by upstream regression",
          owner: "@webpresso/agent-kit",
          expiry: "2026-07-15",
          linkedIssue: "https://github.com/webpresso/agent-kit/issues/999",
        },
      ],
    });
    writeJson(join(root, "outdated.json"), {
      vite: { wanted: "8.0.14", latest: "8.1.0", dependencyType: "devDependencies" },
    });

    expect(runCheck(root)).toContain("OK: declared dependencies and packageManager are current");
  });
});
