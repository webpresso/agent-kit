/**
 * `wp worktree` command router.
 *
 * Mirrors the tech-debt router pattern:
 * - router.ts        — registers the CAC command and wires options
 * - router-dispatch.ts — dispatches subcommands
 */
import type { CAC } from "cac";

import { executeWorktreeSubcommand, type WorktreeCommandOptions } from "./router-dispatch.js";

const HELP_TEXT = [
  "Usage: wp worktree <subcommand> [options]",
  "",
  "Subcommands:",
  "  root                                          Print managed root",
  "  new [branch] [--base <ref>]                   Create managed worktree and seed .agent/",
  "  list [--all]                                  List repo or global managed worktrees",
  "  refresh [--all|--repo <dir>]                  Refresh managed registry from git",
  "  prune --all                                   Prune stale managed registry entries",
  "  migrate                                       Move legacy sibling _worktrees",
  "  adopt <blueprint-slug> <path>                 Claim existing checkout as owner",
  "  rebind <blueprint-slug> [--path <path>]       Repair owner metadata",
  "  remove <branch-or-path> [--force]             Remove a worktree",
  "",
  "Options:",
  "  --name <name>       Human-friendly generated branch slug (new only)",
  "  --prefix <prefix>   Prefix for generated branches (new only, default: agent)",
  "  --all               Use global managed inventory where supported",
  "  --repo <dir>        Repo root for refresh/rebind (default: cwd)",
  "  --dry-run           Print the resolved worktree target without writing",
  "  --cwd <dir>         Repo root (default: process.cwd())",
].join("\n");

export function registerWorktreeRouter(cli: CAC): void {
  cli
    .command(
      "worktree [subcommand] [...args]",
      "Agent-kit managed git worktrees (root, new, list, refresh, prune, migrate, adopt, rebind, remove)",
    )
    .option("--base <ref>", "Base ref for the new branch (new only, default: HEAD)")
    .option("--path <dir>", "Explicit filesystem path for adopt/rebind only; rejected for new")
    .option("--name <name>", "Human-friendly generated branch slug (new only)")
    .option("--prefix <prefix>", "Prefix for generated branches (new only, default: agent)")
    .option("--dry-run", "Print the resolved worktree target without writing (new only)")
    .option("--force", "Force remove even with uncommitted changes (remove only)")
    .option("--all", "Use global managed inventory where supported")
    .option("--repo <dir>", "Repo root for refresh/rebind (default: cwd)")
    .option("--cwd <dir>", "Repo root to operate from (default: process.cwd())")
    .action(
      async (
        subcommand: string | undefined,
        args: string[],
        options: WorktreeCommandOptions & { "--": string[] },
      ) => {
        if (!subcommand) {
          console.log(HELP_TEXT);
          return;
        }
        await executeWorktreeSubcommand(subcommand, args, options);
      },
    );
}
