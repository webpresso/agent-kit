/**
 * Cross-org correlation allowlist loader.
 *
 * Reads `.agent/correlate.allow.yaml` from the repo root.
 * The file declares which orgs this repo permits cross-org correlation with.
 * Both sides must allowlist each other for a dependency to resolve.
 *
 * File format:
 *   permits:
 *     - other-org
 *     - trusted-partner
 */
import type { AllowlistEntry } from "./resolver.js";
export type { AllowlistEntry };
/**
 * Reads `.agent/correlate.allow.yaml` from `cwd`, validates it, and returns
 * a flat array of `AllowlistEntry` rows ready for SQL insert.
 *
 * The source_org is derived from the git remote of `cwd`.
 * Missing file or invalid YAML returns an empty array (no error thrown).
 */
export declare function loadAllowlist(cwd: string): AllowlistEntry[];
/**
 * Returns true when both `sourceOrg` and `targetOrg` have allowlisted each
 * other in the provided entries.
 */
export declare function bothSidesAllowlist(sourceOrg: string, targetOrg: string, allowlist: readonly AllowlistEntry[]): boolean;
//# sourceMappingURL=allowlist.d.ts.map