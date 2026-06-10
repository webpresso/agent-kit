/**
 * Hook group merge utilities — deduplication and merge logic for HooksMap.
 *
 * Extracted from index.ts to allow emitters and other consumers to import
 * merge logic without pulling in the full scaffolder surface.
 */
import type { HookGroup, HooksMap } from './ir.js';
/**
 * Ensure `group` is present in `groups`. If a group already contains a hook
 * with the same command target, update its metadata (matcher, timeout) but
 * preserve the consumer's materialized command form. If no matching hook is
 * found, append the group.
 */
export declare function ensureGroup(groups: HookGroup[], group: HookGroup): HookGroup[];
/**
 * Merge `addition` hook groups into `existing`, deduplicating via
 * `ensureGroup`. Returns a new HooksMap; does not mutate inputs.
 */
export declare function mergeAgentKitGroups(existing: HooksMap, addition: HooksMap): HooksMap;
//# sourceMappingURL=merge.d.ts.map