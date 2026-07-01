import { existsSync } from "node:fs";
import path from "node:path";
import { getWorkspaceRepos } from "#db/workspace-config.js";
import { readHooksManifest, withHookVendorState, writeHooksManifest, } from "#cli/commands/init/scaffolders/agent-hooks/manifest.js";
import { disableManagedHooksFromManifest, scaffoldAgentHooks, trustCodexWebpressoHooksForRepo, } from "#cli/commands/init/scaffolders/agent-hooks/index.js";
import { deriveHookStatus } from "#hooks/status/index.js";
import { readInstalledHooksMap } from "#hooks/shared/installed-hooks.js";
function parseFlag(argv, flag) {
    return argv.includes(flag);
}
function summarizeVendorState(repoRoot, vendor, manifestState) {
    const hooksMap = readInstalledHooksMap(repoRoot, vendor);
    const details = deriveHookStatus({
        hooksMap,
        vendor,
        manifestExists: true,
        vendorState: manifestState,
    });
    const counts = new Map();
    for (const detail of details) {
        counts.set(detail.status, (counts.get(detail.status) ?? 0) + 1);
    }
    const parts = [...counts.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([status, count]) => `${status}:${count}`);
    return `${vendor}[${parts.join(", ")}]`;
}
function summarizeProjectedState(repoRoot, vendorState) {
    return [
        summarizeVendorState(repoRoot, "claude", vendorState.claude),
        summarizeVendorState(repoRoot, "codex", vendorState.codex),
    ].join("; ");
}
function uniqueRepoRoots(currentRoot, workspaceRepos, includeWorkspace) {
    if (!includeWorkspace)
        return [currentRoot];
    return [...new Set([currentRoot, ...workspaceRepos])];
}
function formatReport(report, stdout) {
    stdout.write(`wp hooks upgrade: ${report.repoRoot}\n`);
    stdout.write(`  scope: ${report.mode}\n`);
    stdout.write(`  mode: ${report.apply ? "apply" : "dry-run"}\n`);
    stdout.write(`  before: ${report.beforeSummary}\n`);
    stdout.write(`  projected: ${report.projectedSummary}\n`);
    for (const result of report.results) {
        const relative = path.relative(report.repoRoot, result.targetPath) || result.targetPath;
        stdout.write(`  - ${relative}: ${result.action}\n`);
    }
    for (const warning of report.warnings) {
        stdout.write(`  warning: ${warning}\n`);
    }
}
export async function upgradeHooksForRepo(repoRoot, options) {
    const manifest = readHooksManifest(repoRoot);
    const mergeOptions = options.apply ? {} : { dryRun: true };
    const scaffoldInput = { repoRoot, options: mergeOptions, trustCodexHooks: false };
    const scaffolded = await scaffoldAgentHooks(scaffoldInput);
    let nextManifest = withHookVendorState(scaffolded.manifest, ["claude", "codex"], "enabled");
    let results = [scaffolded.claude, scaffolded.codex];
    const warnings = [
        manifest === null
            ? "bootstrapping from legacy/no-manifest hook state using the current scaffolder contract"
            : "",
        ...(options.apply
            ? []
            : ["dry-run only — re-run with `--apply` after reviewing the projected delta"]),
    ].filter((warning) => warning.length > 0);
    if (manifest !== null) {
        const disabledVendors = ["claude", "codex"].filter((vendor) => manifest.vendorState[vendor] === "disabled");
        if (disabledVendors.length > 0) {
            const disabledMutation = disableManagedHooksFromManifest(scaffoldInput, nextManifest, disabledVendors);
            results = [
                ...results,
                ...[disabledMutation.claude, disabledMutation.codex].filter((result) => result !== undefined),
            ];
            nextManifest = withHookVendorState(nextManifest, disabledVendors, "disabled");
        }
    }
    if (options.apply) {
        writeHooksManifest(repoRoot, nextManifest.claude, nextManifest.codex, nextManifest.vendorState);
        if (options.trustCodexHooks && nextManifest.vendorState.codex === "enabled") {
            await trustCodexWebpressoHooksForRepo({ repoRoot, options: {}, trustCodexHooks: false });
        }
    }
    return {
        repoRoot,
        mode: "single",
        apply: options.apply,
        results,
        warnings,
        beforeSummary: manifest === null
            ? "legacy/no-manifest"
            : summarizeProjectedState(repoRoot, manifest.vendorState),
        projectedSummary: summarizeProjectedState(repoRoot, nextManifest.vendorState),
    };
}
export async function hooksUpgradeCommand(argv, deps = {}) {
    const cwd = deps.cwd ?? process.cwd();
    const stdout = deps.stdout ?? process.stdout;
    const apply = parseFlag(argv, "--apply");
    const workspace = parseFlag(argv, "--workspace");
    const repos = uniqueRepoRoots(cwd, deps.workspaceRepos ?? getWorkspaceRepos(), workspace).filter((repoRoot) => existsSync(repoRoot));
    if (repos.length === 0) {
        stdout.write("wp hooks upgrade: no repos found\n");
        return 1;
    }
    for (const repoRoot of repos) {
        const report = await upgradeHooksForRepo(repoRoot, {
            apply,
            trustCodexHooks: deps.trustCodexHooks ?? apply,
        });
        formatReport({ ...report, mode: workspace ? "workspace" : "single" }, stdout);
    }
    return 0;
}
//# sourceMappingURL=index.js.map