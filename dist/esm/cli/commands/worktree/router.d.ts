/**
 * `wp worktree` command router.
 *
 * Mirrors the tech-debt router pattern:
 * - router.ts        — registers the CAC command and wires options
 * - router-dispatch.ts — dispatches subcommands
 */
import type { CAC } from 'cac';
export declare function registerWorktreeRouter(cli: CAC): void;
//# sourceMappingURL=router.d.ts.map