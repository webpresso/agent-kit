import { getPackageScript, isRecursiveWpScript } from "#cli/package-scripts.js";
import { getManagedRunner } from "#tool-runtime";
import { createCliLogSink } from "./quality-log-store.js";
import { emitCliCommandOutput, runCliCommandSequence } from "./quality-runner.js";
export const QA_COMMAND_HELP = [
    "Run the repository QA gate through the portable wp surface.",
    "",
    "Examples:",
    "  wp qa",
    "  wp qa --print-command",
].join("\n");
const RECURSIVE_QA_MESSAGE = "Refusing to run a recursive qa script. Point package.json scripts.qa at the real QA pipeline, not `wp qa`.\n";
export function registerQaCommand(cli) {
    cli
        .command("qa", QA_COMMAND_HELP)
        .option("--full", "Print the full raw output instead of the default summary-first view")
        .option("--print-command", "Print the resolved command instead of executing it")
        .action(async (flags) => {
        const command = buildQaCommand({ cwd: process.cwd() });
        if (flags.printCommand) {
            if (!command) {
                writeStderr(process.stderr, RECURSIVE_QA_MESSAGE);
                return 1;
            }
            console.log(formatShellCommand(command));
            return 0;
        }
        const result = await runQaCommand({ cwd: process.cwd() });
        emitCliCommandOutput({
            entry: result.entry,
            summary: result.entry.summary ?? "",
            passed: result.exitCode === 0,
            full: Boolean(flags.full),
            toolName: "wp_qa",
        });
        return result.exitCode;
    });
}
export function buildQaCommand(options = {}) {
    const cwd = options.cwd ?? process.cwd();
    const qaScript = getPackageScript(cwd, "qa");
    if (qaScript && isRecursiveWpScript(qaScript, "qa"))
        return;
    const resolution = getManagedRunner("vp");
    return {
        command: resolution.command,
        args: [...resolution.args, "run", "qa"],
    };
}
export async function runQaCommand(options = {}, deps = {}) {
    const command = buildQaCommand(options);
    if (!command) {
        writeStderr(deps.stderr ?? process.stderr, RECURSIVE_QA_MESSAGE);
        const sink = createCliLogSink("qa", options.cwd);
        sink.write(RECURSIVE_QA_MESSAGE);
        const entry = await sink.finalize({
            exitCode: 1,
            summary: "qa failed: recursive qa script",
            options: { recursive: true },
        });
        return { exitCode: 1, entry };
    }
    const result = await runCliCommandSequence({
        commandName: "qa",
        commands: [{ command: command.command, args: command.args }],
        cwd: options.cwd,
        summary: ({ exitCode, timedOut, aborted }) => {
            if (timedOut)
                return "qa timed out";
            if (aborted)
                return "qa aborted";
            return exitCode === 0 ? "qa passed" : `qa failed (exit ${exitCode})`;
        },
    });
    return { exitCode: result.exitCode, entry: result.entry };
}
function formatShellCommand(config) {
    return [config.command, ...config.args].map(shellQuote).join(" ");
}
function shellQuote(value) {
    return /^[A-Za-z0-9_./:=@+-]+$/u.test(value) ? value : `'${value.replace(/'/gu, "'\\''")}'`;
}
function writeStderr(stream, message) {
    stream.write(message);
}
//# sourceMappingURL=qa.js.map