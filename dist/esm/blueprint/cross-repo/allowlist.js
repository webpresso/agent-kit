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
import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { load as yamlLoad } from "js-yaml";
import { z } from "zod";
import { bothSidesAllowlistEntries } from "./resolver.js";
// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------
const correlateAllowSchema = z.object({
    permits: z.array(z.string()).default([]),
});
// ---------------------------------------------------------------------------
// Loader
// ---------------------------------------------------------------------------
/**
 * Reads `.agent/correlate.allow.yaml` from `cwd`, validates it, and returns
 * a flat array of `AllowlistEntry` rows ready for SQL insert.
 *
 * The source_org is derived from the git remote of `cwd`.
 * Missing file or invalid YAML returns an empty array (no error thrown).
 */
export function loadAllowlist(cwd) {
    const filePath = path.join(cwd, ".agent", "correlate.allow.yaml");
    if (!existsSync(filePath))
        return [];
    let raw;
    try {
        raw = yamlLoad(readFileSync(filePath, "utf8"));
    }
    catch {
        return [];
    }
    const parsed = correlateAllowSchema.safeParse(raw ?? {});
    if (!parsed.success)
        return [];
    const sourceOrg = detectOrgFromCwd(cwd);
    return parsed.data.permits.map((permittedOrg) => ({
        source_org: sourceOrg,
        permitted_org: permittedOrg,
    }));
}
/**
 * Returns true when both `sourceOrg` and `targetOrg` have allowlisted each
 * other in the provided entries.
 */
export function bothSidesAllowlist(sourceOrg, targetOrg, allowlist) {
    return bothSidesAllowlistEntries(sourceOrg, targetOrg, allowlist);
}
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
/**
 * Detect the org name from the git remote of `cwd`.
 * Parses SSH (`git@github.com:org/repo.git`) and HTTPS URLs.
 * Falls back to `'unknown'` on any failure.
 */
function detectOrgFromCwd(cwd) {
    try {
        const remote = execSync("git remote get-url origin", {
            cwd,
            stdio: ["ignore", "pipe", "ignore"],
            encoding: "utf8",
            timeout: 5000,
        }).trim();
        const match = remote.match(/[:/]([^/]+)\/[^/]+(?:\.git)?$/);
        if (match?.[1])
            return match[1];
    }
    catch {
        // silent — no remote or git not available
    }
    return "unknown";
}
//# sourceMappingURL=allowlist.js.map