import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

import type { MergeOptions } from "#cli/commands/init/merge";
import {
  makeNoopSpinnerFactory,
  type SpinnerFactory,
} from "#cli/commands/init/scaffolders/spinner";
import { checkVersionPin } from "#cli/commands/init/scaffolders/version-pin";

export interface EnsureRtkInput {
  repoRoot: string;
  options: MergeOptions;
  spawn?: typeof spawnSync;
  pinFilePath?: string;
  strict?: boolean;
  spinnerFactory?: SpinnerFactory;
}

export type EnsureRtkResult =
  | { kind: "rtk-ok"; installed: boolean }
  | { kind: "rtk-skipped-dry-run" }
  | { kind: "rtk-not-found"; hint: string }
  | { kind: "rtk-init-failed"; exitCode: number };

const NOT_FOUND_HINT =
  "rtk is not on PATH. Install it manually (macOS: `brew install rtk`) and re-run.";

// `rtk --version` answers in ~10ms; 3s is generous headroom. Bounding the
// presence probe keeps a hung/wrong binary from stalling `wp setup`. The
// `brew install` / `rtk init` calls below are intentionally left unbounded —
// they are user-driven installs with inherited stdio where a fixed deadline
// would wrongly kill a legitimately slow run.
const RTK_PROBE_TIMEOUT_MS = 3000;
const RTK_HOOK_RELATIVE_PATH = join(".claude", "hooks", "rtk-rewrite.sh");
const CLAUDE_SETTINGS_RELATIVE_PATH = join(".claude", "settings.json");

function hasInstalledRtkHook(repoRoot: string): boolean {
  const hookPath = join(repoRoot, RTK_HOOK_RELATIVE_PATH);
  const settingsPath = join(repoRoot, CLAUDE_SETTINGS_RELATIVE_PATH);
  if (!existsSync(hookPath) || !existsSync(settingsPath)) return false;

  try {
    const settings = readFileSync(settingsPath, "utf8");
    return settings.includes("rtk-rewrite.sh");
  } catch {
    return false;
  }
}

export function ensureRtk(input: EnsureRtkInput): EnsureRtkResult {
  if (input.options.dryRun) return { kind: "rtk-skipped-dry-run" };

  const spawn = input.spawn ?? spawnSync;
  const spinner = (input.spinnerFactory ?? makeNoopSpinnerFactory())("rtk");

  let installed = false;
  spinner.start();
  let probe = spawn("rtk", ["--version"], { encoding: "utf8", timeout: RTK_PROBE_TIMEOUT_MS });
  if (probe.error || (probe.status !== null && probe.status !== 0)) {
    if (process.platform !== "darwin") {
      spinner.fail("rtk not found");
      return { kind: "rtk-not-found", hint: NOT_FOUND_HINT };
    }

    const install = spawn("brew", ["install", "rtk"], { stdio: "inherit" });
    if (install.status !== 0) {
      spinner.fail("rtk install failed");
      return { kind: "rtk-not-found", hint: NOT_FOUND_HINT };
    }

    installed = true;
    probe = spawn("rtk", ["--version"], { encoding: "utf8", timeout: RTK_PROBE_TIMEOUT_MS });
    if (probe.error || (probe.status !== null && probe.status !== 0)) {
      spinner.fail("rtk not found after install");
      return { kind: "rtk-not-found", hint: NOT_FOUND_HINT };
    }
  }

  const installedVersion = String(probe.stdout ?? "").trim();
  const pinCheck = checkVersionPin(
    "rtk",
    installedVersion,
    input.pinFilePath ?? join(input.repoRoot, "compatible-versions.json"),
  );
  if (!pinCheck.ok) {
    if (input.strict) {
      spinner.fail("rtk version mismatch");
      return { kind: "rtk-init-failed", exitCode: -1 };
    }
    console.warn(pinCheck.warning);
  }

  if (hasInstalledRtkHook(input.repoRoot)) {
    spinner.succeed("rtk ready");
    return { kind: "rtk-ok", installed };
  }

  const result = spawn("rtk", ["init", "-g", "--auto-patch"], {
    cwd: input.repoRoot,
    stdio: "inherit",
    env: {
      ...process.env,
      RTK_TELEMETRY_DISABLED: "1",
    },
  });

  if (result.status !== 0) {
    spinner.fail("rtk init failed");
    return { kind: "rtk-init-failed", exitCode: result.status ?? -1 };
  }

  spinner.succeed("rtk ready");
  return { kind: "rtk-ok", installed };
}
