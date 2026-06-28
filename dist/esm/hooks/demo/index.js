import { HOOK_EVENT_NAMES, WP_HOOK_SPECS } from "#cli/commands/init/scaffolders/agent-hooks/ir.js";
import { readHooksManifest, } from "#cli/commands/init/scaffolders/agent-hooks/manifest.js";
import { readInstalledHooksMap, resolveInstalledHooksPath, } from "#hooks/shared/installed-hooks.js";
const GUARD_HOOKS = new Set(WP_HOOK_SPECS.filter((spec) => spec.event === "PreToolUse").map((spec) => spec.bin));
function validateEvent(event) {
    const validEvents = HOOK_EVENT_NAMES;
    if (!validEvents.includes(event)) {
        throw new Error(`Unknown hook event "${event}". Valid events: ${validEvents.join(", ")}`);
    }
}
function resolveHookName(command) {
    for (const spec of WP_HOOK_SPECS) {
        if (command.includes(spec.bin))
            return spec.bin;
    }
    return command;
}
function matcherMatchesTool(matcher, tool) {
    if (matcher === undefined || tool === undefined)
        return true;
    return matcher
        .split("|")
        .map((part) => part.trim())
        .filter(Boolean)
        .includes(tool);
}
function simulateGroup(group, tool, vendorState) {
    return group.hooks.map((entry) => {
        const hook = resolveHookName(entry.command);
        if (vendorState === "disabled") {
            return {
                hook,
                command: entry.command,
                matcher: group.matcher,
                verdict: "disabled",
                reason: "vendor is explicitly disabled in the hooks manifest",
            };
        }
        if (!matcherMatchesTool(group.matcher, tool)) {
            return {
                hook,
                command: entry.command,
                matcher: group.matcher,
                verdict: "skipped-matcher",
                reason: `tool "${tool}" does not match matcher "${group.matcher}"`,
            };
        }
        if (GUARD_HOOKS.has(hook)) {
            return {
                hook,
                command: entry.command,
                matcher: group.matcher,
                verdict: "would-enforce",
                reason: "guard-class hook would run for this simulated tool/event",
            };
        }
        return {
            hook,
            command: entry.command,
            matcher: group.matcher,
            verdict: "would-run",
            reason: group.matcher !== undefined && tool === undefined
                ? "hook would run; pass --tool to test matcher-specific routing"
                : "hook would run for this simulated event",
        };
    });
}
export function simulateHookDemo(input) {
    validateEvent(input.event);
    const groups = input.hooksMap[input.event] ?? [];
    const vendorState = input.vendorState ?? "enabled";
    return {
        event: input.event,
        vendor: input.vendor,
        tool: input.tool,
        rows: groups.flatMap((group) => simulateGroup(group, input.tool, vendorState)),
    };
}
function parseVendorFlag(argv) {
    const idx = argv.indexOf("--vendor");
    if (idx === -1 || idx + 1 >= argv.length)
        return "claude";
    return argv[idx + 1] === "codex" ? "codex" : "claude";
}
function parseToolFlag(argv) {
    const idx = argv.indexOf("--tool");
    if (idx === -1 || idx + 1 >= argv.length)
        return undefined;
    return argv[idx + 1];
}
function removeFlag(argv, flag) {
    const args = [...argv];
    const idx = args.indexOf(flag);
    if (idx !== -1) {
        args.splice(idx, 2);
    }
    return args;
}
function printResult(result, vendorPath, stdout) {
    const toolLabel = result.tool ? `, tool: ${result.tool}` : "";
    stdout.write("wp hooks demo — simulation only (no hooks executed, no files changed)\n");
    stdout.write(`scenario: event: ${result.event}, vendor: ${result.vendor}${toolLabel}\n`);
    stdout.write(`config: ${vendorPath}\n`);
    if (result.rows.length === 0) {
        stdout.write("result: no hooks registered for this simulated event\n");
        return;
    }
    stdout.write("\n");
    for (const row of result.rows) {
        stdout.write(`- ${row.hook}: ${row.verdict}\n`);
        stdout.write(`  command: ${row.command}\n`);
        if (row.matcher !== undefined)
            stdout.write(`  matcher: ${row.matcher}\n`);
        stdout.write(`  reason: ${row.reason}\n`);
    }
}
export async function demoCommand(argv, deps = {}) {
    const stdout = deps.stdout ?? process.stdout;
    const argsWithoutVendor = removeFlag(argv, "--vendor");
    const args = removeFlag(argsWithoutVendor, "--tool");
    const event = args[0];
    if (event === undefined || event.startsWith("--")) {
        throw new Error("Usage: wp hooks demo <event> [--vendor <claude|codex>] [--tool <name>]");
    }
    const cwd = deps.cwd ?? process.cwd();
    const env = deps.env ?? process.env;
    const repoRoot = env["CLAUDE_PROJECT_DIR"] ?? cwd;
    const vendor = parseVendorFlag(argv);
    const tool = parseToolFlag(argv);
    const hooksMap = readInstalledHooksMap(repoRoot, vendor);
    const manifest = readHooksManifest(repoRoot);
    const result = simulateHookDemo({
        hooksMap,
        event,
        vendor,
        tool,
        vendorState: manifest?.vendorState[vendor] ?? "enabled",
    });
    printResult(result, resolveInstalledHooksPath(repoRoot, vendor), stdout);
}
//# sourceMappingURL=index.js.map