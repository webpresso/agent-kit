import { existsSync } from "node:fs";
import path from "node:path";
import { sharedOxlintConfigArgs } from "#config/oxlint/shared-config-path";
import { addAffectedOptions, resolveAffectedTargets } from "#git/affected";
import { getManagedRunner } from "#tool-runtime";
import { emitCliCommandOutput, runCliCommandSequence } from "./quality-runner.js";
export const LINT_COMMAND_HELP = [
    "Lint via the `vp lint` facade.",
    "",
    "Examples:",
    "  wp lint",
    "  wp lint --file src/index.ts",
    "  wp lint --file src/a.ts src/b.ts",
    "  wp lint --affected              # staged JS/TS files only",
    "  wp lint --affected --branch     # changed vs origin/${GITHUB_BASE_REF:-main}",
    "  wp lint --fix",
    "",
    "`--affected` only sees staged files. Run git add first, or use `--affected --branch`.",
].join("\n");
const OXLINT_EXTENSIONS = new Set([".ts", ".tsx", ".mts", ".cts", ".js", ".jsx", ".cjs", ".mjs"]);
export function registerLintCommand(cli, deps = {}) {
    addAffectedOptions(cli
        .command("lint [...targets]", LINT_COMMAND_HELP)
        .option("--file <path>", "Lint a file or path target (repeatable)"))
        .option("--fix", "Apply autofixes via vp lint --fix")
        .option("--full", "Print the full raw output instead of the default summary-first view")
        .action(async (targetsOrFlags, maybeFlags) => {
        const positionalTargets = Array.isArray(targetsOrFlags)
            ? targetsOrFlags.filter((target) => typeof target === "string")
            : [];
        const flags = (maybeFlags ?? (isRecord(targetsOrFlags) ? targetsOrFlags : {}));
        const flagFiles = toArray(flags.file);
        if (positionalTargets.length > 0 && flagFiles.length === 0) {
            console.error("File targets must be passed with --file.");
            return 1;
        }
        const files = [...flagFiles, ...positionalTargets];
        const affected = Boolean(flags.affected);
        const branch = Boolean(flags.branch);
        const fix = Boolean(flags.fix);
        const cwd = process.cwd();
        let executionCwd = cwd;
        let targetFiles = files.length > 0 ? files : undefined;
        if (affected || branch) {
            const resolution = resolveAffectedTargets({
                commandName: "lint",
                cwd,
                affected,
                branch,
                explicitTargets: files,
                explicitTargetFlags: "--file",
                policy: fix ? "fail-closed" : "fallback-full",
                mapChangedFiles: filterLintableFiles,
                emptyMessage: lintEmptyMessage,
                degradedFallbackMessage: (reason) => `Unable to determine affected files for lint (${reason}); falling back to whole-repo lint.`,
                degradedFailClosedMessage: (reason) => `Unable to determine affected files for lint --fix (${reason}); refusing a degraded whole-repo write. Rerun without --affected or pass --file explicitly.`,
            }, deps);
            if (resolution.kind === "invalid") {
                console.error(resolution.message);
                return 1;
            }
            executionCwd = resolution.cwd;
            if (resolution.kind === "degraded-fail-closed") {
                console.error(resolution.message);
                return 1;
            }
            if (resolution.kind === "degraded-fallback") {
                console.error(resolution.message);
                targetFiles = undefined;
            }
            if (resolution.kind === "empty") {
                console.log(resolution.message);
                return 0;
            }
            if (resolution.kind === "scoped") {
                targetFiles = [...resolution.targets];
            }
        }
        const command = buildLintCommand({
            files: targetFiles,
            fix,
            cwd: executionCwd,
        });
        const result = await runCliCommandSequence({
            commandName: "lint",
            commands: [command],
            cwd: executionCwd,
            metadataOptions: {
                affected,
                branch: affected ? branch : undefined,
                fix,
                files: targetFiles,
            },
            summary: ({ exitCode, timedOut, aborted }) => {
                if (timedOut)
                    return "lint timed out via vp lint";
                if (aborted)
                    return "lint aborted via vp lint";
                return exitCode === 0
                    ? "lint passed via vp lint"
                    : `lint failed via vp lint (exit ${exitCode})`;
            },
        });
        emitCliCommandOutput({
            entry: result.entry,
            summary: result.entry.summary ?? "",
            passed: result.exitCode === 0,
            full: Boolean(flags.full),
            toolName: "lint-oxlint",
        });
        return result.exitCode;
    });
}
function lintEmptyMessage(scope) {
    return scope === "branch"
        ? "No affected lintable files changed vs base ref — skipping lint."
        : "No staged affected lintable files — skipping lint.";
}
export function buildLintCommand(options = {}) {
    const cwd = options.cwd ?? process.cwd();
    const args = ["lint", "--format=json"];
    args.push(...sharedOxlintConfigArgs(cwd, args));
    if (options.fix)
        args.push("--fix");
    if (options.files && options.files.length > 0)
        args.push(...options.files);
    else
        args.push(".");
    const resolution = getManagedRunner("vp", { outputPolicy: "structured" });
    return {
        command: resolution.command,
        args: [...resolution.args, ...args],
    };
}
function filterLintableFiles(files, cwd) {
    return files.filter((file) => {
        const extension = path.extname(file).toLowerCase();
        return OXLINT_EXTENSIONS.has(extension) && existsSync(path.join(cwd, file));
    });
}
function toArray(value) {
    if (value === undefined)
        return [];
    return typeof value === "string" ? [value] : [...value];
}
function isRecord(value) {
    return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
//# sourceMappingURL=lint.js.map