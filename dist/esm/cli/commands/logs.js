import { readFileSync } from "node:fs";
import { CLI_LOG_COMMANDS, isCliLogCommandName, readCliLogEntry } from "./quality-log-store.js";
export const LOGS_COMMAND_HELP = [
    "Print persisted raw output for a recent summary-first quality command run.",
    "",
    "Examples:",
    "  wp logs test",
    "  wp logs qa 2",
].join("\n");
export function registerLogsCommand(cli) {
    cli
        .command("logs <command> [n]", LOGS_COMMAND_HELP)
        .action((command, n) => {
        if (!isCliLogCommandName(command)) {
            console.error(`Unknown logs command: ${command}. Expected one of: ${CLI_LOG_COMMANDS.join(", ")}`);
            return 1;
        }
        const ordinal = n === undefined ? 1 : Number(n);
        if (!Number.isInteger(ordinal) || ordinal < 1 || ordinal > 10) {
            console.error("Usage: wp logs <command> [n]\n`n` must be an integer in the range 1..10.");
            return 1;
        }
        const entry = readCliLogEntry(command, ordinal);
        if (!entry) {
            console.log(`No logs yet for ${command}.`);
            return 0;
        }
        process.stdout.write(readFileSync(entry.logPath, "utf8"));
        return 0;
    });
}
//# sourceMappingURL=logs.js.map