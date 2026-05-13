/**
 * `ak sync` — projects the canonical agent-kit rule/skill catalog into the
 * supported host surfaces.
 *
 * Projects unified rule + skill content (catalog ∪ consumer) into per-IDE
 * surfaces according to `DEFAULT_UNIFIED_CONSUMERS`.
 *
 * Flags:
 *   --kind rules|skills   Filter to a single kind (default: both).
 *   --check               Dry-run; exit 1 on first drift, no writes.
 */
import type { CAC } from 'cac';
export declare function registerSyncCommand(cli: CAC): void;
//# sourceMappingURL=sync.d.ts.map