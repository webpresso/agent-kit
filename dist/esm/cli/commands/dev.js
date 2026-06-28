import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { loadDevManifest, resolveDevServices } from "#dev/index";
function findRepoRoot(cwd = process.cwd()) {
    let current = resolve(cwd);
    for (;;) {
        if (existsSync(join(current, "package.json")) && existsSync(join(current, ".git"))) {
            return current;
        }
        const parent = dirname(current);
        if (parent === current)
            return resolve(cwd);
        current = parent;
    }
}
function isAgentKitSourceRepo(repoRoot) {
    const packageJsonPath = join(repoRoot, "package.json");
    if (!existsSync(packageJsonPath))
        return false;
    try {
        const packageJson = JSON.parse(readFileSync(packageJsonPath, "utf8"));
        return packageJson.name === "@webpresso/agent-kit" && existsSync(join(repoRoot, "src"));
    }
    catch {
        return false;
    }
}
function runtimeHooksStatePath(repoRoot) {
    return join(repoRoot, ".webpresso", "runtime-hooks.json");
}
function readRuntimeHooksEnabled(repoRoot) {
    const statePath = runtimeHooksStatePath(repoRoot);
    if (!existsSync(statePath))
        return false;
    try {
        const parsed = JSON.parse(readFileSync(statePath, "utf8"));
        return parsed.runtimeHooks === true;
    }
    catch {
        return false;
    }
}
export function runRuntimeHooksCommand(action, input = {}) {
    const repoRoot = findRepoRoot(input.cwd);
    const statePath = runtimeHooksStatePath(repoRoot);
    const sourceRepo = isAgentKitSourceRepo(repoRoot);
    if (!sourceRepo) {
        throw new Error("wp dev runtime-hooks is only available in the @webpresso/agent-kit source repo.");
    }
    if (action === "enable" || action === "disable") {
        mkdirSync(dirname(statePath), { recursive: true });
        writeFileSync(statePath, `${JSON.stringify({ runtimeHooks: action === "enable" }, null, 2)}\n`, "utf8");
    }
    else if (action !== "status") {
        throw new Error("Usage: wp dev runtime-hooks enable|disable|status");
    }
    return { enabled: readRuntimeHooksEnabled(repoRoot), sourceRepo, statePath };
}
export function getDevHelpText() {
    return [
        "Usage: wp dev [target] [options]",
        "",
        "Options:",
        "  --manifest <path>  Dev manifest path",
        "  --doctor           Validate manifest and print resolved services",
        "  --clean            Clean supervisor-owned state for the target",
        "  --restart          Restart the target",
        "",
        "Subcommands:",
        "  wp dev runtime-hooks enable|disable|status",
        "  -h, --help         Display this message",
        "",
        "Manifest precedence: --manifest -> WP_APP_MANIFEST -> ./app-manifest.yaml -> error",
    ].join("\n");
}
export async function runDevCommand(input) {
    const mode = input.mode ?? "start";
    const { manifestPath, manifest } = loadDevManifest({
        cwd: input.cwd,
        manifestPath: input.manifestPath,
    });
    const services = resolveDevServices(manifest, input.target);
    return { mode, manifestPath, services };
}
export function registerDevCommand(cli) {
    cli
        .command("dev runtime-hooks <action>", "Toggle source-repo runtime hook dispatch")
        .action((action) => {
        const result = runRuntimeHooksCommand(action);
        console.log(JSON.stringify(result, null, 2));
        process.exit(0);
    });
    cli
        .command("dev [target]", "Run a manifest-backed development target")
        .option("--manifest <path>", "Dev manifest path (precedence: --manifest -> WP_APP_MANIFEST -> ./app-manifest.yaml -> error)")
        .option("--doctor", "Validate manifest and print resolved services")
        .option("--clean", "Clean supervisor-owned state for the target")
        .option("--restart", "Restart the target")
        .action(async (target, options) => {
        if (options.clean && options.restart) {
            throw new Error("Use either --clean or --restart, not both.");
        }
        const mode = options.doctor
            ? "doctor"
            : options.clean
                ? "clean"
                : options.restart
                    ? "restart"
                    : "start";
        const result = await runDevCommand({
            manifestPath: options.manifest,
            mode,
            target,
        });
        console.log(JSON.stringify({
            mode: result.mode,
            manifest: result.manifestPath,
            services: result.services,
        }, null, 2));
        process.exit(0);
    });
}
//# sourceMappingURL=dev.js.map