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
import type { HookSpec, HooksMap } from "#cli/commands/init/scaffolders/agent-hooks/ir.js";
import type { HooksManifest } from "#cli/commands/init/scaffolders/agent-hooks/manifest.js";
export type OutputWriter = Pick<NodeJS.WriteStream, "write">;
/**
 * Generate a human-readable verdict-first change report.
 *
 * @param before - The manifest from before setup ran (null on first install).
 * @param after  - The manifest produced by the current setup run.
 * @returns A multi-line string ready for display.
 */
export declare function generateSetupReport(before: HooksManifest | null, after: HooksManifest): string;
/**
 * Print the setup report to process.stdout.
 */
export declare function printSetupReport(before: HooksManifest | null, after: HooksManifest, writer?: OutputWriter): void;
/**
 * Build a simplified HooksMap from a list of HookSpecs.
 * Uses the bin name directly as the command (no path resolution), which is
 * sufficient for showing a human-readable dry-run diff.
 */
export declare function buildProposedHooksMapFromSpecs(specs: readonly HookSpec[]): HooksMap;
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
export declare function generateHooksDryRunDiff(claudeSettingsPath: string, codexHooksPath: string, proposedClaude: HooksMap, proposedCodex: HooksMap): string;
//# sourceMappingURL=report.d.ts.map