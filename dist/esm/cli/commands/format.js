import { existsSync } from "node:fs";
import path from "node:path";
import { addAffectedOptions, resolveAffectedTargets } from "#git/affected";
import { getManagedRunner } from "#tool-runtime";
import { emitCliCommandOutput, runCliCommandSequence } from "./quality-runner.js";
export const FORMAT_COMMAND_HELP = [
    "Format the workspace via the portable wp surface. Writes in place by default.",
    "",
    "Examples:",
    "  wp format            # rewrite files in place",
    "  wp format --file src/index.ts",
    "  wp format --file src/a.ts src/b.ts",
    "  wp format --affected              # staged formatable files only",
    "  wp format --affected --branch     # changed vs origin/${GITHUB_BASE_REF:-main}",
    "  wp format --check    # exit 1 on any unformatted file (no writes)",
    "",
    "`--affected` only sees staged files. Run git add first, or use `--affected --branch`.",
].join("\n");
const OXFMT_EXTENSIONS = new Set([
    ".ts",
    ".tsx",
    ".mts",
    ".cts",
    ".js",
    ".jsx",
    ".cjs",
    ".mjs",
    ".json",
    ".md",
    ".mdx",
    ".sh",
    ".tmpl",
    ".yaml",
    ".yml",
]);
export function registerFormatCommand(cli, deps = {}) {
    addAffectedOptions(cli
        .command("format [...targets]", FORMAT_COMMAND_HELP)
        .option("--file <path>", "Format a file or path target (repeatable)"))
        .option("--check", "Check formatting without writing changes; exit 1 on drift")
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
        const check = Boolean(flags.check);
        const cwd = process.cwd();
        let executionCwd = cwd;
        let targetFiles = files.length > 0 ? files : undefined;
        if (affected || branch) {
            const resolution = resolveAffectedTargets({
                commandName: "format",
                cwd,
                affected,
                branch,
                explicitTargets: files,
                explicitTargetFlags: "--file",
                policy: check ? "fallback-full" : "fail-closed",
                mapChangedFiles: filterFormatableFiles,
                emptyMessage: formatEmptyMessage,
                degradedFallbackMessage: (reason) => `Unable to determine affected files for format --check (${reason}); falling back to a whole-repo format check.`,
                degradedFailClosedMessage: (reason) => `Unable to determine affected files for format (${reason}); refusing a degraded whole-repo write. Rerun without --affected, pass --check, or target files explicitly.`,
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
        const result = await runFormatSafely({
            files: targetFiles,
            check,
            cwd: executionCwd,
            metadataOptions: {
                affected,
                branch: affected ? branch : undefined,
                check,
                files: targetFiles,
            },
        });
        if (!result.ok) {
            console.error(result.message);
            return 1;
        }
        emitCliCommandOutput({
            entry: result.value.entry,
            summary: result.value.entry.summary ?? "",
            passed: result.value.exitCode === 0,
            full: Boolean(flags.full),
            toolName: "wp_format",
        });
        return result.value.exitCode;
    });
}
function formatEmptyMessage(scope) {
    return scope === "branch"
        ? "No affected formatable files changed vs base ref — skipping format."
        : "No staged affected formatable files — skipping format.";
}
async function runFormatSafely(options) {
    try {
        const command = buildFormatCommand(options);
        const result = await runCliCommandSequence({
            commandName: "format",
            commands: [command],
            cwd: options.cwd,
            metadataOptions: options.metadataOptions ?? {
                check: Boolean(options.check),
                files: options.files,
            },
            summary: ({ exitCode, timedOut, aborted }) => {
                if (timedOut)
                    return "format timed out";
                if (aborted)
                    return "format aborted";
                if (exitCode === 0)
                    return options.check ? "format check passed" : "format applied";
                return options.check
                    ? `format check failed (exit ${exitCode}) — run \`wp format\` to apply fixes`
                    : `format failed (exit ${exitCode})`;
            },
        });
        return { ok: true, value: { exitCode: result.exitCode, entry: result.entry } };
    }
    catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : String(error) };
    }
}
export function buildFormatCommand(options) {
    const args = [options.check ? "--check" : "--write", "--ignore-path", ".gitignore"];
    if (options.files && options.files.length > 0)
        args.push(...options.files);
    const resolution = getManagedRunner("vp", { outputPolicy: "structured" });
    return {
        command: resolution.command,
        args: [...resolution.args, "fmt", ...args],
    };
}
function filterFormatableFiles(files, cwd) {
    return files.filter((file) => {
        const extension = path.extname(file).toLowerCase();
        return OXFMT_EXTENSIONS.has(extension) && existsSync(path.join(cwd, file));
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
//# sourceMappingURL=format.js.map