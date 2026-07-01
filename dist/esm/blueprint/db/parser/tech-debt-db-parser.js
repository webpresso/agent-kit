/**
 * Tech-Debt DB Parser
 *
 * Extracts structured data from tech-debt `h-NNN-<slug>.md` files for DB projection.
 * Reuses the existing `techDebtFrontmatterSchema` for validation.
 *
 * Fault-tolerant: malformed YAML logs to stderr and returns partial data; never throws.
 */
import crypto from "node:crypto";
import { execSync } from "node:child_process";
import path from "node:path";
import matter from "gray-matter";
import { techDebtFrontmatterSchema } from "#tech-debt/schema";
// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------
function safeString(value) {
    if (value === null || value === undefined)
        return null;
    if (value instanceof Date)
        return value.toISOString().split("T")[0] ?? null;
    const str = String(value).trim();
    return str.length > 0 ? str : null;
}
/** Detect org from git remote URL in the directory containing filePath. */
function detectOrganization(filePath) {
    try {
        const dir = path.dirname(filePath);
        const remote = execSync("git remote get-url origin", {
            cwd: dir,
            stdio: ["ignore", "pipe", "ignore"],
            encoding: "utf8",
            timeout: 5000,
        }).trim();
        const match = remote.match(/[:/]([^/]+)\/[^/]+(?:\.git)?$/);
        if (match?.[1])
            return match[1];
    }
    catch {
        // No remote or git not available — silently return unknown
    }
    return "unknown";
}
/** Detect visibility from frontmatter or path convention. Defaults to private. */
function detectVisibility(frontmatter, filePath) {
    if (typeof frontmatter["visibility"] === "string") {
        return frontmatter["visibility"] === "public" ? "public" : "private";
    }
    if (filePath.includes("/public/"))
        return "public";
    return "private";
}
// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------
/**
 * Parse a tech-debt `h-NNN-<slug>.md` file for DB projection.
 *
 * Fault-tolerant: invalid frontmatter logs to stderr and returns partial data.
 */
export function parseTechDebtForDb(content, filePath, slug) {
    const byteSize = Buffer.byteLength(content, "utf8");
    const contentHash = crypto.createHash("sha256").update(content).digest("hex");
    const organization = detectOrganization(filePath);
    const visibility = detectVisibility({}, filePath);
    // Baseline: defaults for all fields in case frontmatter is absent/broken
    let status = "accepted";
    let severity = "low";
    let category = "complexity";
    let reviewCadence = "monthly";
    let lastReviewed = null;
    let created = null;
    let nextReview = null;
    let basePriority = null;
    let linkedBlueprints = [];
    let autoFiledHash = null;
    let rawFrontmatter = {};
    try {
        const parsed = matter(content);
        rawFrontmatter = parsed.data;
    }
    catch (err) {
        process.stderr.write(`[tech-debt-db-parser] Failed to parse frontmatter in ${filePath}: ${String(err)}\n`);
    }
    // Run the canonical schema through safeParse so we get computed fields (nextReview, basePriority)
    const schemaResult = techDebtFrontmatterSchema.safeParse(rawFrontmatter);
    if (schemaResult.success) {
        const d = schemaResult.data;
        status = d.status;
        severity = d.severity;
        category = d.category;
        reviewCadence = d.review_cadence;
        lastReviewed = safeString(d.last_reviewed);
        created = safeString(d.created ?? null);
        nextReview = d.nextReview;
        basePriority = d.basePriority;
        linkedBlueprints = d.linked_blueprints;
        autoFiledHash = d.auto_filed_hash ?? null;
    }
    else {
        // Schema validation failed — fall back to raw field extraction so the DB
        // still gets as much data as possible without throwing.
        process.stderr.write(`[tech-debt-db-parser] Schema validation failed for ${filePath}: ${JSON.stringify(schemaResult.error.issues.map((i) => i.message))}\n`);
        status = safeString(rawFrontmatter["status"]) ?? status;
        severity = safeString(rawFrontmatter["severity"]) ?? severity;
        category = safeString(rawFrontmatter["category"]) ?? category;
        reviewCadence = safeString(rawFrontmatter["review_cadence"]) ?? reviewCadence;
        lastReviewed = safeString(rawFrontmatter["last_reviewed"]);
        created = safeString(rawFrontmatter["created"]);
        linkedBlueprints = Array.isArray(rawFrontmatter["linked_blueprints"])
            ? rawFrontmatter["linked_blueprints"].filter((v) => typeof v === "string")
            : [];
        autoFiledHash = safeString(rawFrontmatter["auto_filed_hash"]);
    }
    return {
        slug,
        filePath,
        status,
        severity,
        category,
        reviewCadence,
        lastReviewed,
        created,
        nextReview,
        basePriority,
        linkedBlueprints,
        autoFiledHash,
        organization,
        visibility,
        byteSize,
        contentHash,
    };
}
//# sourceMappingURL=tech-debt-db-parser.js.map