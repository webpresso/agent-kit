import { existsSync } from "node:fs";
import path from "node:path";
import { buildTestCommand, isCommandSequenceConfig, parseTestSuiteName, resolveTestTarget, } from "#test";
import { addAffectedOptions, resolveAffectedTargets } from "#git/affected";
import { discoverTestFiles as discoverChangedTestFiles } from "#hooks/stop/qa-changed-files";
import { emitCliCommandOutput, runCliCommandSequence, } from "./quality-runner.js";
export const TEST_COMMAND_HELP = [
    "Run tests through the portable webpresso test surface.",
    "",
    "Examples:",
    "  wp test --suite unit",
    "  wp test --suite integration",
    "  wp test --package cli2",
    "  wp test --file apps/cli2/src/commands/target.test.ts",
    "  wp test --affected              # staged changed source → colocated tests",
    "  wp test --affected --branch     # changed vs origin/${GITHUB_BASE_REF:-main}",
    "  wp test --package cli2 -- --reporter=dot",
    "",
    "`--affected` is an inner-loop shortcut, not a coverage gate; full `wp test` / `wp qa` remains the bookend gate.",
    "`--affected` only sees staged files. Run git add first, or use `--affected --branch`.",
].join("\n");
export function createAkTestCommandConfig(input) {
    const target = resolveTestTarget({
        package: toArray(input.package),
        file: toArray(input.file),
        positional: [],
    });
    return buildTestCommand(target, { ...input, cwd: input.cwd });
}
export function registerTestCommand(cli, deps = {}) {
    addAffectedOptions(cli
        .command("test", TEST_COMMAND_HELP)
        .option("--suite <name>", "Run the all, unit, or integration suite")
        .option("--package <name>", "Run tests for a package target")
        .option("--file <path>", "Run tests for a file target"))
        .option("--watch", "Run Vitest in watch mode or vp test:watch for package targets")
        .option("--coverage", "Forward coverage to the underlying test runner")
        .option("-t, --test-name-pattern <pattern>", "Forward a Vitest test name pattern")
        .option("--mutation", "Use the vp test:mutation task for package targets")
        .option("--workers", "Use the vp test:workers task for package targets")
        .option("--cache", "Enable vp cache")
        .option("--no-cache", "Disable vp cache")
        .option("--parallel", "Forward --parallel to vp")
        .option("--concurrency-limit <n>", "Forward a vp concurrency limit")
        .option("--log <mode>", "Forward vp log mode")
        .option("--full", "Print the full raw output instead of the default summary-first view")
        .option("--print-command", "Print the resolved command instead of executing it")
        .action(async (flags) => {
        const rawArgv = process.argv.slice(2);
        const affected = Boolean(flags.affected);
        const branch = Boolean(flags.branch);
        const cwd = process.cwd();
        let executionCwd = cwd;
        const packageTargets = toArray(flags.package);
        const explicitFiles = toArray(flags.file);
        let resolvedFiles = explicitFiles.length > 0 ? explicitFiles : undefined;
        let resolvedPackages = packageTargets.length > 0 ? packageTargets : undefined;
        if (affected || branch) {
            const resolution = resolveAffectedTargets({
                commandName: "test",
                cwd,
                affected,
                branch,
                explicitTargets: [...packageTargets, ...explicitFiles],
                explicitTargetFlags: "--file or --package",
                policy: "fallback-full",
                mapChangedFiles: (changedFiles, repoRoot) => {
                    const discovered = (deps.discoverTestFiles ?? discoverChangedTestFiles)([...changedFiles], repoRoot);
                    return discovered.filter((file) => existsSync(path.join(repoRoot, file)));
                },
                emptyMessage: testEmptyMessage,
                degradedFallbackMessage: (reason) => `Unable to determine affected files for test (${reason}); falling back to the full test surface.`,
                degradedFailClosedMessage: (reason) => `Unable to determine affected files for test (${reason}); refusing degraded affected execution.`,
            }, deps);
            if (resolution.kind === "invalid") {
                console.error(resolution.message);
                return 1;
            }
            executionCwd = resolution.cwd;
            if (resolution.kind === "degraded-fallback") {
                console.error(resolution.message);
                resolvedFiles = undefined;
                resolvedPackages = undefined;
            }
            if (resolution.kind === "empty") {
                console.log(resolution.message);
                return 0;
            }
            if (resolution.kind === "scoped") {
                resolvedFiles = [...resolution.targets];
                resolvedPackages = undefined;
            }
        }
        const command = createAkTestCommandConfig({
            cwd: executionCwd,
            package: resolvedPackages,
            file: resolvedFiles,
            passthrough: getPassthroughArgs(rawArgv),
            suite: parseTestSuiteName(flags.suite),
            watch: Boolean(flags.watch),
            coverage: Boolean(flags.coverage),
            testNamePattern: flags.testNamePattern,
            mutation: Boolean(flags.mutation),
            workers: Boolean(flags.workers),
            cache: rawArgv.includes("--cache"),
            noCache: rawArgv.includes("--no-cache"),
            parallel: Boolean(flags.parallel),
            concurrencyLimit: toOptionalNumber(flags.concurrencyLimit),
            log: flags.log,
        });
        if (flags.printCommand) {
            console.log(formatShellCommand(command));
            return 0;
        }
        const commands = flattenCommandConfig(command);
        const result = await runCliCommandSequence({
            commandName: "test",
            commands,
            cwd: executionCwd,
            metadataOptions: {
                affected,
                branch: affected ? branch : undefined,
                suite: parseTestSuiteName(flags.suite),
                package: resolvedPackages ?? [],
                file: resolvedFiles ?? [],
            },
            summary: ({ exitCode, timedOut, aborted }) => {
                if (timedOut)
                    return "test timed out";
                if (aborted)
                    return "test aborted";
                return exitCode === 0 ? "test passed" : `test failed (exit ${exitCode})`;
            },
        });
        emitCliCommandOutput({
            entry: result.entry,
            summary: result.entry.summary ?? "",
            passed: result.exitCode === 0,
            full: Boolean(flags.full),
            toolName: "wp_test",
        });
        return result.exitCode;
    });
}
function testEmptyMessage(scope) {
    return scope === "branch"
        ? "No affected test files found for changed files vs base ref — skipping test."
        : "No staged affected test files found — skipping test.";
}
function getPassthroughArgs(argv) {
    const separatorIndex = argv.indexOf("--");
    return separatorIndex === -1 ? [] : argv.slice(separatorIndex + 1);
}
function formatShellCommand(config) {
    if (isCommandSequenceConfig(config)) {
        return config.sequence.map(formatShellCommand).join(" && ");
    }
    return [config.command, ...config.args].map(shellQuote).join(" ");
}
function shellQuote(value) {
    return /^[A-Za-z0-9_./:=@+-]+$/u.test(value) ? value : `'${value.replace(/'/gu, "'\\''")}'`;
}
function toArray(value) {
    if (value === undefined)
        return [];
    return typeof value === "string" ? [value] : [...value];
}
function toOptionalNumber(value) {
    if (value === undefined)
        return;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
}
function flattenCommandConfig(config) {
    if (isCommandSequenceConfig(config)) {
        return config.sequence.map((step) => ({
            command: step.command,
            args: step.args,
            env: step.env,
        }));
    }
    return [{ command: config.command, args: config.args, env: config.env }];
}
//# sourceMappingURL=test.js.map