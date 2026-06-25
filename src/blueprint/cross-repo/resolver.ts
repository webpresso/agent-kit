/**
 * Cross-repo correlation resolver.
 *
 * Default deny for cross-org references: a dependency only resolves when both
 * the source org and the target org have each other in their allowlist.
 * Same-org dependencies always resolve (no allowlist needed).
 */

export interface AllowlistEntry {
  readonly source_org: string;
  readonly permitted_org: string;
}

/**
 * Returns true when a cross-repo dependency between `sourceOrg` and
 * `targetOrg` should resolve.
 *
 * Resolution rules:
 * - Same org → always resolves.
 * - Different org → both sides must have a mutual allowlist entry:
 *     source_org=sourceOrg permits targetOrg  AND
 *     source_org=targetOrg permits sourceOrg
 */
export function resolvesCrossRepo(
  sourceOrg: string,
  targetOrg: string,
  allowlist: readonly AllowlistEntry[],
): boolean {
  if (sourceOrg === targetOrg) return true;
  return bothSidesAllowlistEntries(sourceOrg, targetOrg, allowlist);
}

/**
 * Checks whether *both* sides have allowlisted each other.
 * Exported for use by the allowlist loader and the audit.
 */
export function bothSidesAllowlistEntries(
  sourceOrg: string,
  targetOrg: string,
  allowlist: readonly AllowlistEntry[],
): boolean {
  const sourcePernmitsTarget = allowlist.some(
    (e) => e.source_org === sourceOrg && e.permitted_org === targetOrg,
  );
  const targetPermitsSource = allowlist.some(
    (e) => e.source_org === targetOrg && e.permitted_org === sourceOrg,
  );
  return sourcePernmitsTarget && targetPermitsSource;
}
