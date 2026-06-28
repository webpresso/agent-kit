/**
 * Release-version validation for production deploys.
 *
 * Schema-parametric: validates the version *pair* and semver shape; the consumer
 * reads its own release-metadata file (path + shape stay consumer-side).
 */

// Strict semver (semver.org reference pattern): rejects malformed prerelease/
// build identifiers (e.g. `1.2.3-..`, `1.2.3+.`) a permissive pattern would let
// through a fail-closed deploy gate.
const SEMVER =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/u;

/** Assert `version` is a non-empty semantic version; returns it for chaining. */
export function assertSemanticReleaseVersion(version: string): string {
  if (!SEMVER.test(version)) {
    throw new Error(
      `Production deploy requires an explicit semantic release version; received ${version || "<missing>"}`,
    );
  }
  return version;
}

/**
 * Validate that the requested release version is valid semver AND matches the
 * version the consumer read from its committed release metadata. Throws a clear
 * `version mismatch` otherwise.
 */
export function validateReleaseMetadata(params: {
  readonly requested: string;
  readonly metadataVersion: string;
}): void {
  assertSemanticReleaseVersion(params.requested);
  if (params.requested !== params.metadataVersion) {
    throw new Error(
      `Production deploy version mismatch: metadata releaseVersion=${params.metadataVersion}, requested=${params.requested}`,
    );
  }
}
