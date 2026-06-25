import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";

import { beforeAll, describe, expect, it } from "vitest";

import { resolveRuntimeTarget } from "../src/build/runtime-targets.js";
import { probeRuntimeTypecheckParity } from "../src/typecheck/runtime-parity.js";

const REPO_ROOT = process.cwd();

let runtimeBinaryPath = "";

describe("compiled host runtime typecheck parity", () => {
  beforeAll(() => {
    const target = resolveRuntimeTarget();
    if (!target) {
      throw new Error(`No compiled runtime target for ${process.platform}/${process.arch}`);
    }

    execFileSync("bun", ["scripts/build-runtime-binaries.ts"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        HUSKY: "0",
      },
    });
    execFileSync("bun", ["scripts/stage-plugin-runtime-artifacts.ts"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        HUSKY: "0",
      },
    });

    runtimeBinaryPath = join(
      REPO_ROOT,
      "bin",
      "runtime",
      target.id,
      process.platform === "win32" ? "wp.exe" : "wp",
    );
  }, 120_000);

  it("exposes --file/--package help and resolved-scope execution for wp typecheck", () => {
    expect(existsSync(runtimeBinaryPath)).toBe(true);

    const probe = probeRuntimeTypecheckParity({
      command: runtimeBinaryPath,
      env: {
        ...process.env,
        WP_SKIP_UPDATE_CHECK: "1",
      },
    });

    expect(probe.ok).toBe(true);
    expect(probe.helpOutput).toContain("--file");
    expect(probe.helpOutput).toContain("--package");
    expect(probe.fileOutput).toContain("Resolved typecheck scopes: @parity/root, @parity/widget");
  }, 120_000);
});
