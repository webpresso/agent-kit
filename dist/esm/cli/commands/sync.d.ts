/**
 * `ak sync` — single sync command that replaces the legacy
 * `ak symlink sync` and `ak cursor-windsurf-sync`.
 *
 * Projects unified rule + skill content (catalog ∪ consumer) into per-IDE
 * surfaces according to `DEFAULT_UNIFIED_CONSUMERS`. Also runs the existing
 * `syncAll` (commands, workflows, AGENTS.md, mcp.json, tail-IDE skill
 * fan-out) so the one command covers every surface.
 *
 * Flags:
 *   --kind rules|skills   Filter to a single kind (default: both).
 *   --check               Dry-run; exit 1 on first drift, no writes.
 */
import type { CAC } from 'cac';
export declare function registerSyncCommand(cli: CAC): void;
//# sourceMappingURL=sync.d.ts.map