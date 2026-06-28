import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createWpError, ensureWpError, formatWpError, toWpErrorJson } from "#errors/wp-error.js";
import { spawnRuntimeCommandSync } from "#runtime/executor.js";
import { parseSecretOrchestrationConfig } from "#secrets/config/schema.js";
import { getSecretProviderPlugin } from "#secrets/providers/registry.js";
import { resolveSecretSink } from "#secrets/sinks/planner.js";
const DEFAULT_SECRET_CONFIG_PATH = join(".webpresso", "secrets.config.json");
const DEFAULT_DOCS_PATH = "docs/errors/wp-secret-orchestration.md";
export function registerSecretsCommand(cli) {
    cli
        .command("secrets <action> [target]", "Secret orchestration commands (doctor, bootstrap github)")
        .option("--profile <name>", "Secret profile name", { default: "preview" })
        .option("--sink <id>", "Secret sink id")
        .option("--json", "Emit machine-readable JSON")
        .option("--lane <lane>", "Lane to bootstrap (repeatable)", { default: [] })
        .option("--apply", "Apply GitHub bootstrap changes instead of dry-run planning")
        .action(async (action, target, flags) => {
        const options = {
            cwd: process.cwd(),
            profile: flags.profile,
            sink: flags.sink,
            json: Boolean(flags.json),
            lanes: toArray(flags.lane),
            apply: Boolean(flags.apply),
        };
        return runSecretsCommand(action, target, options);
    });
}
export async function runSecretsCommand(action, target, options = {}, deps = {}) {
    try {
        if (action === "doctor") {
            return await runSecretsDoctor(options, deps);
        }
        if (action === "run") {
            return runSecretsRun(options, deps);
        }
        if (action === "bootstrap" && target === "github") {
            return await runSecretsBootstrapGithub(options, deps);
        }
        throw createWpError({
            code: "WP_SECRETS_ACTION_UNKNOWN",
            problem: `Unknown secrets action "${action}${target ? ` ${target}` : ""}".`,
            fix: "Use `wp secrets doctor`, `wp secrets run`, or `wp secrets bootstrap github`.",
            docsPath: DEFAULT_DOCS_PATH,
        });
    }
    catch (error) {
        const wpError = ensureWpError(error, {
            code: "WP_SECRETS_COMMAND_FAILED",
            docsPath: DEFAULT_DOCS_PATH,
        });
        writeError(wpError, Boolean(options.json), deps);
        return 1;
    }
}
export async function runSecretsDoctor(options = {}, deps = {}) {
    const config = readSecretConfig(options.cwd, deps);
    const profile = options.profile ?? "preview";
    const sink = options.sink ?? "dev-server";
    const plan = resolveSecretSink({ config, sink, profile, op: "run" });
    const provider = config.providers[config.profiles[plan.profile].provider];
    if (!provider) {
        throw createWpError({
            code: "WP_SECRETS_PROVIDER_MISSING",
            problem: `Missing provider metadata for profile "${plan.profile}".`,
            docsPath: DEFAULT_DOCS_PATH,
        });
    }
    const plugin = getSecretProviderPlugin(plan.provider);
    const doctor = await plugin.diagnose({
        provider,
        profileName: plan.profile,
        environment: plan.environment,
    });
    const payload = {
        ok: true,
        code: "WP_SECRETS_DOCTOR_OK",
        profile: plan.profile,
        sink: plan.sink,
        plan,
        doctor,
    };
    writePayload(payload, Boolean(options.json), deps);
    return 0;
}
export function runSecretsRun(options = {}, deps = {}) {
    const rawArgv = (options.argv ?? process.argv).slice(2);
    const separatorIndex = rawArgv.indexOf("--");
    const commandParts = separatorIndex === -1 ? [] : rawArgv.slice(separatorIndex + 1);
    const [command, ...args] = commandParts;
    if (!command) {
        throw createWpError({
            code: "WP_SECRETS_RUN_USAGE",
            problem: "Missing command after `wp secrets run --`.",
            fix: "Example: wp secrets run --sink dev-server --profile preview -- vp run dev",
            docsPath: DEFAULT_DOCS_PATH,
        });
    }
    const config = readSecretConfig(options.cwd, deps);
    const plan = resolveSecretSink({
        config,
        sink: options.sink ?? "dev-server",
        profile: options.profile ?? "preview",
        op: "run",
    });
    const result = (deps.runSecretScopedCommand ?? spawnRuntimeCommandSync)({
        command,
        args,
        cwd: options.cwd,
        profile: plan.runtimeProfile,
        environment: plan.environment,
        stdio: "inherit",
    });
    if (result.error) {
        throw createWpError({
            code: "WP_SECRETS_RUN_FAILED",
            problem: `Secret-scoped command failed for sink "${plan.sink}".`,
            cause: result.error.message,
            docsPath: DEFAULT_DOCS_PATH,
        });
    }
    return result.status ?? 1;
}
export async function runSecretsBootstrapGithub(options = {}, deps = {}) {
    const config = readSecretConfig(options.cwd, deps);
    const profile = options.profile ?? "production";
    const lanes = options.lanes && options.lanes.length > 0 ? [...options.lanes] : ["preview_main", "prd"];
    const plan = resolveSecretSink({
        config,
        sink: "github-actions-bootstrap",
        profile,
        op: options.apply ? "apply" : "verify",
    });
    const provider = config.providers[config.profiles[plan.profile].provider];
    if (!provider) {
        throw createWpError({
            code: "WP_GITHUB_BOOTSTRAP_PROVIDER_MISSING",
            problem: `Missing provider metadata for profile "${plan.profile}".`,
            docsPath: DEFAULT_DOCS_PATH,
        });
    }
    const plugin = getSecretProviderPlugin(plan.provider);
    const bootstrapPlan = plugin.planBootstrap
        ? await plugin.planBootstrap({
            provider,
            profileName: plan.profile,
            environment: plan.environment,
            lanes,
        })
        : undefined;
    if (!bootstrapPlan) {
        throw createWpError({
            code: "WP_GITHUB_BOOTSTRAP_UNSUPPORTED",
            problem: `Provider "${plan.provider}" does not support GitHub bootstrap planning.`,
            docsPath: DEFAULT_DOCS_PATH,
        });
    }
    if (options.apply) {
        for (const secretName of bootstrapPlan.requiredSecrets) {
            const value = (deps.env ?? process.env)[secretName] ?? "";
            if (!value) {
                throw createWpError({
                    code: "WP_GITHUB_BOOTSTRAP_MISSING_SECRET",
                    problem: `Missing value for ${secretName}.`,
                    fix: `Export ${secretName} before rerunning with --apply.`,
                    docsPath: DEFAULT_DOCS_PATH,
                });
            }
            (deps.runGitHubSecretSet ?? defaultGitHubSecretSet)(secretName, value, options.cwd);
        }
    }
    const payload = {
        ok: true,
        code: options.apply ? "WP_GITHUB_BOOTSTRAP_APPLIED" : "WP_GITHUB_BOOTSTRAP_PLANNED",
        plan: bootstrapPlan,
        applied: Boolean(options.apply),
    };
    writePayload(payload, Boolean(options.json), deps);
    return 0;
}
export function createGitHubSecretSetInvocation(name, value, cwd) {
    return {
        command: "gh",
        args: ["secret", "set", name, "--body-file", "-"],
        options: {
            cwd,
            input: value,
            stdio: ["pipe", "ignore", "ignore"],
        },
    };
}
function defaultGitHubSecretSet(name, value, cwd) {
    const invocation = createGitHubSecretSetInvocation(name, value, cwd);
    execFileSync(invocation.command, [...invocation.args], invocation.options);
}
function readSecretConfig(cwd, deps) {
    const raw = deps.readConfig ? deps.readConfig(cwd) : readCommittedSecretsConfig(cwd);
    try {
        return parseSecretOrchestrationConfig(raw);
    }
    catch (error) {
        throw createWpError({
            code: "WP_SECRETS_CONFIG_INVALID",
            problem: `Invalid ${DEFAULT_SECRET_CONFIG_PATH}.`,
            cause: error instanceof Error ? error.message : String(error),
            fix: "Run `wp migrate secrets --dry-run --json` or update the config to schemaVersion: 1.",
            docsPath: DEFAULT_DOCS_PATH,
        });
    }
}
function readCommittedSecretsConfig(cwd) {
    const root = cwd ?? process.cwd();
    const file = join(root, DEFAULT_SECRET_CONFIG_PATH);
    if (!existsSync(file)) {
        throw createWpError({
            code: "WP_SECRETS_CONFIG_MISSING",
            problem: `Missing ${DEFAULT_SECRET_CONFIG_PATH}.`,
            fix: "Commit repo secret metadata before running secret orchestration commands.",
            docsPath: DEFAULT_DOCS_PATH,
        });
    }
    return JSON.parse(readFileSync(file, "utf8"));
}
function writePayload(payload, json, deps) {
    const writer = deps.stdout ?? process.stdout;
    if (json) {
        writer.write(`${JSON.stringify(payload, null, 2)}\n`);
        return;
    }
    writer.write(`${payload.code}: ${payload.ok === true ? "ok" : "failed"}\n`);
    writer.write(`${JSON.stringify(payload, null, 2)}\n`);
}
function writeError(error, json, deps) {
    const writer = deps.stderr ?? process.stderr;
    if (json) {
        writer.write(`${JSON.stringify(toWpErrorJson(error), null, 2)}\n`);
        return;
    }
    writer.write(`${formatWpError(error)}\n`);
}
function toArray(value) {
    if (value === undefined)
        return [];
    return typeof value === "string" ? [value] : [...value];
}
//# sourceMappingURL=secrets.js.map