import type { HookGroup, HooksMap } from "#cli/commands/init/scaffolders/agent-hooks/ir.js";
import { HOOK_EVENT_NAMES, WP_HOOK_SPECS } from "#cli/commands/init/scaffolders/agent-hooks/ir.js";
import {
  readHooksManifest,
  type HookVendorState,
} from "#cli/commands/init/scaffolders/agent-hooks/manifest.js";
import {
  readInstalledHooksMap,
  resolveInstalledHooksPath,
  type InstalledHookVendor,
} from "#hooks/shared/installed-hooks.js";

export type HookDemoVerdict = "would-enforce" | "would-run" | "skipped-matcher" | "disabled";

export interface HookDemoRow {
  readonly hook: string;
  readonly command: string;
  readonly matcher?: string;
  readonly verdict: HookDemoVerdict;
  readonly reason: string;
}

export interface HookDemoResult {
  readonly event: string;
  readonly vendor: InstalledHookVendor;
  readonly tool?: string;
  readonly rows: readonly HookDemoRow[];
}

const GUARD_HOOKS = new Set(
  WP_HOOK_SPECS.filter((spec) => spec.event === "PreToolUse").map((spec) => spec.bin),
);

function validateEvent(event: string): void {
  const validEvents: readonly string[] = HOOK_EVENT_NAMES;
  if (!validEvents.includes(event)) {
    throw new Error(`Unknown hook event "${event}". Valid events: ${validEvents.join(", ")}`);
  }
}

function resolveHookName(command: string): string {
  for (const spec of WP_HOOK_SPECS) {
    if (command.includes(spec.bin)) return spec.bin;
  }
  return command;
}

function matcherMatchesTool(matcher: string | undefined, tool: string | undefined): boolean {
  if (matcher === undefined || tool === undefined) return true;
  return matcher
    .split("|")
    .map((part) => part.trim())
    .filter(Boolean)
    .includes(tool);
}

function simulateGroup(
  group: HookGroup,
  tool: string | undefined,
  vendorState: HookVendorState,
): HookDemoRow[] {
  return group.hooks.map((entry) => {
    const hook = resolveHookName(entry.command);
    if (vendorState === "disabled") {
      return {
        hook,
        command: entry.command,
        matcher: group.matcher,
        verdict: "disabled",
        reason: "vendor is explicitly disabled in the hooks manifest",
      } satisfies HookDemoRow;
    }

    if (!matcherMatchesTool(group.matcher, tool)) {
      return {
        hook,
        command: entry.command,
        matcher: group.matcher,
        verdict: "skipped-matcher",
        reason: `tool "${tool}" does not match matcher "${group.matcher}"`,
      } satisfies HookDemoRow;
    }

    if (GUARD_HOOKS.has(hook)) {
      return {
        hook,
        command: entry.command,
        matcher: group.matcher,
        verdict: "would-enforce",
        reason: "guard-class hook would run for this simulated tool/event",
      } satisfies HookDemoRow;
    }

    return {
      hook,
      command: entry.command,
      matcher: group.matcher,
      verdict: "would-run",
      reason:
        group.matcher !== undefined && tool === undefined
          ? "hook would run; pass --tool to test matcher-specific routing"
          : "hook would run for this simulated event",
    } satisfies HookDemoRow;
  });
}

export function simulateHookDemo(input: {
  hooksMap: HooksMap;
  event: string;
  vendor: InstalledHookVendor;
  tool?: string;
  vendorState?: HookVendorState;
}): HookDemoResult {
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

export interface DemoCommandDeps {
  readonly stdout?: Pick<NodeJS.WriteStream, "write">;
  readonly cwd?: string;
  readonly env?: NodeJS.ProcessEnv;
}

function parseVendorFlag(argv: readonly string[]): InstalledHookVendor {
  const idx = argv.indexOf("--vendor");
  if (idx === -1 || idx + 1 >= argv.length) return "claude";
  return argv[idx + 1] === "codex" ? "codex" : "claude";
}

function parseToolFlag(argv: readonly string[]): string | undefined {
  const idx = argv.indexOf("--tool");
  if (idx === -1 || idx + 1 >= argv.length) return undefined;
  return argv[idx + 1];
}

function removeFlag(argv: readonly string[], flag: string): string[] {
  const args = [...argv];
  const idx = args.indexOf(flag);
  if (idx !== -1) {
    args.splice(idx, 2);
  }
  return args;
}

function printResult(
  result: HookDemoResult,
  vendorPath: string,
  stdout: Pick<NodeJS.WriteStream, "write">,
): void {
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
    if (row.matcher !== undefined) stdout.write(`  matcher: ${row.matcher}\n`);
    stdout.write(`  reason: ${row.reason}\n`);
  }
}

export async function demoCommand(
  argv: readonly string[],
  deps: DemoCommandDeps = {},
): Promise<void> {
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
