/**
 * `wp worktree` command router.
 *
 * Mirrors the tech-debt router pattern:
 * - router.ts        — registers the CAC command and wires options
 * - router-dispatch.ts — dispatches subcommands
 */
import type { CAC } from 'cac'

import { executeWorktreeSubcommand, type WorktreeCommandOptions } from './router-dispatch.js'

const HELP_TEXT = [
  'Usage: wp worktree <subcommand> [options]',
  '',
  'Subcommands:',
  '  new [branch] [--base <ref>] [--path <dir>]   Create worktree and seed .agent/',
  '  list                                          List worktrees',
  '  remove <branch-or-path> [--force]             Remove a worktree',
  '',
  'Options:',
  '  --name <name>       Human-friendly generated branch slug (new only)',
  '  --prefix <prefix>   Prefix for generated branches (new only, default: agent)',
  '  --dry-run           Print the resolved worktree target without writing',
  '  --cwd <dir>         Repo root (default: process.cwd())',
].join('\n')

export function registerWorktreeRouter(cli: CAC): void {
  cli
    .command(
      'worktree [subcommand] [...args]',
      'Git worktree management with .agent/ seeding (new, list, remove)',
    )
    .option('--base <ref>', 'Base ref for the new branch (new only, default: HEAD)')
    .option('--path <dir>', 'Explicit filesystem path for the new worktree (new only)')
    .option('--name <name>', 'Human-friendly generated branch slug (new only)')
    .option('--prefix <prefix>', 'Prefix for generated branches (new only, default: agent)')
    .option('--dry-run', 'Print the resolved worktree target without writing (new only)')
    .option('--force', 'Force remove even with uncommitted changes (remove only)')
    .option('--cwd <dir>', 'Repo root to operate from (default: process.cwd())')
    .action(
      async (
        subcommand: string | undefined,
        args: string[],
        options: WorktreeCommandOptions & { '--': string[] },
      ) => {
        if (!subcommand) {
          console.log(HELP_TEXT)
          return
        }
        await executeWorktreeSubcommand(subcommand, args, options)
      },
    )
}
