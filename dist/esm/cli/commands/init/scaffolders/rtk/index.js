import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { makeNoopSpinnerFactory, } from "#cli/commands/init/scaffolders/spinner";
import { checkVersionPin } from "#cli/commands/init/scaffolders/version-pin";
const NOT_FOUND_HINT = "rtk is not on PATH. Install it manually (macOS: `brew install rtk`) and re-run.";
// `rtk --version` answers in ~10ms; 3s is generous headroom. Bounding the
// presence probe keeps a hung/wrong binary from stalling `wp setup`. The
// `brew install` / `rtk init` calls below are intentionally left unbounded —
// they are user-driven installs with inherited stdio where a fixed deadline
// would wrongly kill a legitimately slow run.
const RTK_PROBE_TIMEOUT_MS = 3000;
const RTK_HOOK_RELATIVE_PATH = join(".claude", "hooks", "rtk-rewrite.sh");
const CLAUDE_SETTINGS_RELATIVE_PATH = join(".claude", "settings.json");
const STALE_OMX_CLAUDE_COMMAND = "oh-my-codex/dist/scripts/codex-native-hook.js";
function hasInstalledRtkHook(repoRoot) {
    const hookPath = join(repoRoot, RTK_HOOK_RELATIVE_PATH);
    const settingsPath = join(repoRoot, CLAUDE_SETTINGS_RELATIVE_PATH);
    if (!existsSync(hookPath) || !existsSync(settingsPath))
        return false;
    try {
        const settings = readFileSync(settingsPath, "utf8");
        return settings.includes("rtk-rewrite.sh");
    }
    catch {
        return false;
    }
}
function normalizeClaudeRtkSettings(repoRoot) {
    const settingsPath = join(repoRoot, CLAUDE_SETTINGS_RELATIVE_PATH);
    if (!existsSync(settingsPath))
        return;
    let parsed;
    try {
        parsed = JSON.parse(readFileSync(settingsPath, "utf8"));
    }
    catch {
        return;
    }
    const groups = parsed.hooks?.PreToolUse;
    if (!Array.isArray(groups) || groups.length === 0)
        return;
    const hasDirectWpGuard = groups.some((group) => (group.hooks ?? []).some((hook) => hook.command?.includes("wp-pretool-guard")));
    if (!hasDirectWpGuard)
        return;
    let changed = false;
    const nextGroups = groups.filter((group) => {
        const commands = (group.hooks ?? []).map((hook) => hook.command ?? "");
        const isStaleOmcGroup = commands.some((command) => command.includes(STALE_OMX_CLAUDE_COMMAND));
        if (isStaleOmcGroup)
            changed = true;
        return !isStaleOmcGroup;
    });
    if (!changed)
        return;
    parsed.hooks = { ...parsed.hooks, PreToolUse: nextGroups };
    writeFileSync(settingsPath, `${JSON.stringify(parsed, null, 2)}\n`, "utf8");
}
export function ensureRtk(input) {
    if (input.options.dryRun)
        return { kind: "rtk-skipped-dry-run" };
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
    const pinCheck = checkVersionPin("rtk", installedVersion, input.pinFilePath ?? join(input.repoRoot, "compatible-versions.json"));
    if (!pinCheck.ok) {
        if (input.strict) {
            spinner.fail("rtk version mismatch");
            return { kind: "rtk-init-failed", exitCode: -1 };
        }
        console.warn(pinCheck.warning);
    }
    if (hasInstalledRtkHook(input.repoRoot)) {
        normalizeClaudeRtkSettings(input.repoRoot);
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
    normalizeClaudeRtkSettings(input.repoRoot);
    spinner.succeed("rtk ready");
    return { kind: "rtk-ok", installed };
}
//# sourceMappingURL=index.js.map