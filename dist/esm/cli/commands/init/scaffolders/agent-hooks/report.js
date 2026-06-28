/**
 * report.ts — verdict-first setup report for `wp setup` hook changes.
 *
 * Compares a "before" HooksManifest (null on first install) against an
 * "after" HooksManifest and produces a human-readable change summary.
 *
 * Also provides `generateHooksDryRunDiff` for the `--dry-run` output path,
 * which shows a line-by-line diff between current and proposed hook configs.
 *
 * Symbols:
 *   + = new hook (absent in before, present in after)
 *   - = removed hook (present in before, absent in after)
 *   ~ = status changed (present in both but different command/event pairing)
 *   = = no change (omitted unless --verbose)
 */
import { readFileSync } from "node:fs";
// ── Helpers ───────────────────────────────────────────────────────────────────
/** Extract the bin name from a command string for display. */
function extractBinLabel(command) {
    const skillTagMatch = /# from-skill: ([\w-]+)/u.exec(command);
    if (skillTagMatch?.[1])
        return skillTagMatch[1];
    const launcherMatch = /((?:wp|ak)-[\w-]+)\.sh\b/u.exec(command);
    if (launcherMatch?.[1])
        return launcherMatch[1];
    const hookMatches = [...command.matchAll(/\b((?:wp|ak)-[\w-]+)\b/gu)];
    const hookMatch = hookMatches.at(-1)?.[1];
    if (hookMatch)
        return hookMatch;
    const parts = command.split(/[\s/\\]/);
    const last = parts[parts.length - 1]?.replaceAll(/["']/gu, "");
    return last ?? command;
}
/** Collect all (event, command) pairs from a HooksMap. */
function collectEntries(map) {
    const result = new Map();
    for (const [event, groups] of Object.entries(map)) {
        for (const group of groups) {
            for (const hook of group.hooks) {
                // Key on event + binLabel so two hooks in the same event are distinct
                const label = extractBinLabel(hook.command);
                result.set(`${event}::${label}`, hook.command);
            }
        }
    }
    return result;
}
/** Count total hooks (entries) in a HooksMap. */
function countHooks(map) {
    let n = 0;
    for (const groups of Object.values(map)) {
        for (const group of groups) {
            n += group.hooks.length;
        }
    }
    return n;
}
/** Compute changes between before/after HooksMaps for one vendor. */
function computeVendorChanges(beforeMap, afterMap) {
    const beforeEntries = collectEntries(beforeMap);
    const afterEntries = collectEntries(afterMap);
    const changes = [];
    for (const [key, command] of afterEntries) {
        const [event] = key.split("::");
        if (!event)
            continue;
        const label = extractBinLabel(command);
        if (!beforeEntries.has(key)) {
            changes.push({ symbol: "+", event, command, label });
        }
    }
    for (const [key, command] of beforeEntries) {
        const [event] = key.split("::");
        if (!event)
            continue;
        const label = extractBinLabel(command);
        if (!afterEntries.has(key)) {
            changes.push({ symbol: "-", event, command, label });
        }
    }
    return changes;
}
/** Format a single vendor block of the report. */
function formatVendorBlock(report) {
    const { vendor, changes, totalAfter } = report;
    if (changes.length === 0) {
        return `  ${vendor}: ${totalAfter} hook${totalAfter === 1 ? "" : "s"} (no changes)`;
    }
    const added = changes.filter((c) => c.symbol === "+").length;
    const removed = changes.filter((c) => c.symbol === "-").length;
    const changed = changes.filter((c) => c.symbol === "~").length;
    const parts = [];
    if (added > 0)
        parts.push(`${added} added`);
    if (removed > 0)
        parts.push(`${removed} removed`);
    if (changed > 0)
        parts.push(`${changed} changed`);
    const summary = parts.join(", ");
    const header = `  ${vendor}: ${totalAfter} hook${totalAfter === 1 ? "" : "s"} (${summary})`;
    const lines = changes.map((c) => {
        const eventPart = c.event;
        const binPart = c.label ?? extractBinLabel(c.command);
        return `    ${c.symbol} ${binPart} [${eventPart}]`;
    });
    return [header, ...lines].join("\n");
}
// ── Public API ────────────────────────────────────────────────────────────────
/**
 * Generate a human-readable verdict-first change report.
 *
 * @param before - The manifest from before setup ran (null on first install).
 * @param after  - The manifest produced by the current setup run.
 * @returns A multi-line string ready for display.
 */
export function generateSetupReport(before, after) {
    const beforeClaude = before?.claude ?? {};
    const beforeCodex = before?.codex ?? {};
    const claudeChanges = computeVendorChanges(beforeClaude, after.claude);
    const codexChanges = computeVendorChanges(beforeCodex, after.codex);
    const claudeReport = {
        vendor: "claude",
        changes: claudeChanges,
        totalAfter: countHooks(after.claude),
    };
    const codexReport = {
        vendor: "codex",
        changes: codexChanges,
        totalAfter: countHooks(after.codex),
    };
    const blocks = [
        "Hooks change summary:",
        formatVendorBlock(claudeReport),
        formatVendorBlock(codexReport),
        "  → Run `wp hooks status` to verify hook states",
    ];
    return blocks.join("\n");
}
/**
 * Print the setup report to process.stdout.
 */
export function printSetupReport(before, after, writer = process.stdout) {
    writer.write(generateSetupReport(before, after) + "\n");
}
// ── Proposed map builder ──────────────────────────────────────────────────────
/**
 * Build a simplified HooksMap from a list of HookSpecs.
 * Uses the bin name directly as the command (no path resolution), which is
 * sufficient for showing a human-readable dry-run diff.
 */
export function buildProposedHooksMapFromSpecs(specs) {
    const result = {};
    for (const spec of specs) {
        const group = {
            hooks: [{ type: "command", command: spec.bin, timeout: spec.timeout }],
        };
        const existing = result[spec.event] ?? [];
        result[spec.event] = [...existing, group];
    }
    return result;
}
/** Read current JSON file content, or return empty object string if absent. */
function readCurrentJson(filePath) {
    try {
        return readFileSync(filePath, "utf-8").trimEnd();
    }
    catch {
        return "{}";
    }
}
/** Produce a line-by-line unified diff between two strings (no context lines). */
function lineDiff(current, proposed) {
    const currentLines = current.split("\n");
    const proposedLines = proposed.split("\n");
    const removed = new Set(currentLines.filter((l) => !proposedLines.includes(l)));
    const added = new Set(proposedLines.filter((l) => !currentLines.includes(l)));
    const diffLines = [];
    for (const line of currentLines) {
        if (removed.has(line))
            diffLines.push(`- ${line}`);
    }
    for (const line of proposedLines) {
        if (added.has(line))
            diffLines.push(`+ ${line}`);
    }
    return diffLines.join("\n");
}
/** Format one file's diff block. */
function formatFileDiff(diff) {
    if (diff.current === diff.proposed) {
        return `${diff.label}:\n  (no changes)`;
    }
    const diffText = lineDiff(diff.current, diff.proposed);
    return [`${diff.label}:`, "--- current", "+++ proposed", diffText].join("\n");
}
/**
 * Generate a dry-run diff showing what hook files would change.
 *
 * Reads the current content of the given file paths and diffs them against
 * the proposed content derived from the would-be-after HooksMaps.
 *
 * @param claudeSettingsPath - Absolute path to `.claude/settings.json`.
 * @param codexHooksPath     - Absolute path to `.codex/hooks.json`.
 * @param proposedClaude     - The hooks section that would be written to settings.json.
 * @param proposedCodex      - The hooks object that would be written to hooks.json.
 * @returns A multi-line string suitable for stdout.
 */
export function generateHooksDryRunDiff(claudeSettingsPath, codexHooksPath, proposedClaude, proposedCodex) {
    const claudeCurrent = readCurrentJson(claudeSettingsPath);
    const codexCurrent = readCurrentJson(codexHooksPath);
    // Show only the hooks section, not the full settings.json, for readability.
    const claudeProposed = JSON.stringify({ hooks: proposedClaude }, null, 2);
    const codexProposed = JSON.stringify({ hooks: proposedCodex }, null, 2);
    const claudeDiff = formatFileDiff({
        label: ".claude/settings.json (hooks section)",
        current: claudeCurrent,
        proposed: claudeProposed,
    });
    const codexDiff = formatFileDiff({
        label: ".codex/hooks.json",
        current: codexCurrent,
        proposed: codexProposed,
    });
    return [
        "[DRY RUN] wp setup --with hooks would make the following changes:",
        "",
        claudeDiff,
        "",
        codexDiff,
        "",
        "Run without --dry-run to apply.",
    ].join("\n");
}
//# sourceMappingURL=report.js.map