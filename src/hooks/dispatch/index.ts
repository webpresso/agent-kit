import type { HooksMap } from "#cli/commands/init/scaffolders/agent-hooks/ir.js";
import { HOOK_EVENT_NAMES } from "#cli/commands/init/scaffolders/agent-hooks/ir.js";
import { readInstalledHooksMap } from "#hooks/shared/installed-hooks.js";

export type DispatchOptions = {
  readonly event: string;
  readonly vendor: "claude" | "codex";
  readonly repoRoot: string;
};

export type DispatchResult = {
  readonly event: string;
  readonly vendor: string;
  readonly hooks: readonly DispatchedHook[];
};

export type DispatchedHook = {
  readonly command: string;
  readonly matcher: string | undefined;
};

/**
 * Core dispatch logic — pure and testable.
 *
 * Validates the event against HOOK_EVENT_NAMES, finds registered hook
 * groups for that event in the provided HooksMap, and returns the list of
 * registered hooks. Hooks are listed, not executed; live subprocess
 * invocation is a deferred follow-up.
 */
export async function dispatch(
  hooksMap: HooksMap,
  options: DispatchOptions,
): Promise<DispatchResult> {
  const validEvents: readonly string[] = HOOK_EVENT_NAMES;
  if (!validEvents.includes(options.event)) {
    throw new Error(
      `Unknown hook event "${options.event}". Valid events: ${validEvents.join(", ")}`,
    );
  }

  const groups = hooksMap[options.event] ?? [];
  const dispatched: DispatchedHook[] = [];

  for (const group of groups) {
    for (const hookEntry of group.hooks) {
      dispatched.push({
        command: hookEntry.command,
        matcher: group.matcher,
      });
    }
  }

  return {
    event: options.event,
    vendor: options.vendor,
    hooks: dispatched,
  };
}

function printResult(result: DispatchResult): void {
  const { event, vendor, hooks } = result;
  if (hooks.length === 0) {
    console.log(`wp hooks dispatch: no hooks registered for "${event}" (vendor: ${vendor})`);
    return;
  }
  console.log(`wp hooks dispatch — event: ${event}, vendor: ${vendor}`);
  console.log("");
  for (const hook of hooks) {
    const matcherLabel = hook.matcher !== undefined ? `  matcher: ${hook.matcher}` : "";
    console.log(`  command: ${hook.command}${matcherLabel !== "" ? `\n${matcherLabel}` : ""}`);
  }
}

/**
 * CLI entry point for `wp hooks dispatch <event> [--vendor <vendor>]`.
 *
 * Parses argv, reads the vendor hook config, calls dispatch(), and prints
 * the registered hooks for the event. Live subprocess invocation is deferred.
 */
export async function dispatchCommand(argv: readonly string[]): Promise<void> {
  const args = [...argv];

  let vendor: "claude" | "codex" = "claude";
  const vendorIdx = args.indexOf("--vendor");
  if (vendorIdx !== -1 && vendorIdx + 1 < args.length) {
    const vendorArg = args[vendorIdx + 1];
    if (vendorArg === "codex") {
      vendor = "codex";
    }
    args.splice(vendorIdx, 2);
  }

  const event = args[0];
  if (event === undefined || event.startsWith("--")) {
    console.error("Usage: wp hooks dispatch <event> [--vendor <claude|codex>]");
    console.error(`Valid events: ${HOOK_EVENT_NAMES.join(", ")}`);
    process.exitCode = 1;
    return;
  }

  const repoRoot = process.cwd();
  const hooksMap = readInstalledHooksMap(repoRoot, vendor);

  let result: DispatchResult;
  try {
    result = await dispatch(hooksMap, { event, vendor, repoRoot });
  } catch (error: unknown) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
    return;
  }

  printResult(result);
}
