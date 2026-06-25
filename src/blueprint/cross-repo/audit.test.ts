/**
 * Tests for cross-repo correlation audit.
 *
 * All tests use an in-memory SQLite DB seeded with controlled fixture data —
 * no real git remotes or filesystem blueprints needed.
 */

import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import Database from "better-sqlite3";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { openDb } from "../db/connection.js";
import { resolveBlueprintProjectionDbPath } from "../db/paths.js";
import { auditCrossRepoCorrelation, fixCrossRepoLeak } from "./audit.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Db = Database.Database;

function insertBlueprint(
  db: Db,
  slug: string,
  org: string,
  visibility: "public" | "private",
): void {
  db.prepare(
    `INSERT OR IGNORE INTO blueprints
       (slug, title, status, complexity, owner, created, last_updated, completed_at,
        progress_pct, progress_text, file_path, byte_size, content_hash, ingested_at,
        organization, visibility)
     VALUES (?, ?, 'planned', 'S', 'test', '2026-01-01', '2026-01-01', NULL,
             NULL, NULL, '/fake/path', 0, 'hash', 0, ?, ?)`,
  ).run(slug, slug + "-title", org, visibility);
}

function insertWorkspaceRepo(
  db: Db,
  repoPth: string,
  org: string,
  repoName: string,
  visibility: "public" | "private",
): void {
  db.prepare(
    `INSERT OR IGNORE INTO workspace_repos (repo_path, organization, repo_name, visibility, last_synced)
     VALUES (?, ?, ?, ?, 0)`,
  ).run(repoPth, org, repoName, visibility);
}

function insertCrossRepoDep(
  db: Db,
  blueprintSlug: string,
  targetRepo: string,
  targetSlug: string | null,
  targetSlugHash: string | null,
  isCrossOrg: 0 | 1,
  isRedacted: 0 | 1,
): void {
  db.prepare(
    `INSERT OR IGNORE INTO cross_repo_dependencies
       (blueprint_slug, target_repo, target_slug, target_slug_hash,
        resolved_status, is_cross_org, is_redacted)
     VALUES (?, ?, ?, ?, NULL, ?, ?)`,
  ).run(blueprintSlug, targetRepo, targetSlug, targetSlugHash, isCrossOrg, isRedacted);
}

function insertAllowlist(db: Db, sourceOrg: string, permittedOrg: string): void {
  db.prepare(
    `INSERT OR IGNORE INTO correlate_allowlist (source_org, permitted_org) VALUES (?, ?)`,
  ).run(sourceOrg, permittedOrg);
}

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let tmpDir: string;
let dbPath: string;
let conn: ReturnType<typeof openDb>;

beforeEach(() => {
  tmpDir = mkdtempSync(path.join(tmpdir(), "wp-audit-xrepo-"));
  dbPath = resolveBlueprintProjectionDbPath(tmpDir);
  mkdirSync(path.dirname(dbPath), { recursive: true });
  conn = openDb(dbPath);
});

afterEach(() => {
  conn.close();
  rmSync(tmpDir, { recursive: true, force: true });
});

// ---------------------------------------------------------------------------
// auditCrossRepoCorrelation
// ---------------------------------------------------------------------------

describe("auditCrossRepoCorrelation", () => {
  describe("clean state", () => {
    it("passes when there are no cross-repo dependencies", async () => {
      // No data seeded
      const result = await auditCrossRepoCorrelation(tmpDir);
      expect(result.pass).toBe(true);
      expect(result.leaks).toHaveLength(0);
      expect(result.missingAllowlists).toHaveLength(0);
    });

    it("passes when no DB exists", async () => {
      const emptyDir = mkdtempSync(path.join(tmpdir(), "wp-empty-"));
      try {
        const result = await auditCrossRepoCorrelation(emptyDir);
        expect(result.pass).toBe(true);
      } finally {
        rmSync(emptyDir, { recursive: true, force: true });
      }
    });

    it("passes when all cross-repo deps are same-org (is_cross_org=0) and target is public", async () => {
      insertBlueprint(conn.db, "bp-a", "acme-corp", "public");
      // Same-org private target is fine when source is also public — no cross-org issue, no allowlist needed.
      // But the leak check fires for public→private unredacted. Use public target to avoid that.
      insertWorkspaceRepo(conn.db, "acme-corp/other-repo", "acme-corp", "other-repo", "public");
      insertCrossRepoDep(conn.db, "bp-a", "acme-corp/other-repo", "some-slug", null, 0, 0);

      const result = await auditCrossRepoCorrelation(tmpDir);
      expect(result.pass).toBe(true);
      expect(result.leaks).toHaveLength(0);
      expect(result.missingAllowlists).toHaveLength(0);
    });

    it("passes when cross-org dep has mutual allowlist", async () => {
      insertBlueprint(conn.db, "bp-a", "acme-corp", "public");
      insertWorkspaceRepo(conn.db, "other-org/repo", "other-org", "repo", "private");
      insertCrossRepoDep(conn.db, "bp-a", "other-org/repo", null, "abc123", 1, 1);
      insertAllowlist(conn.db, "acme-corp", "other-org");
      insertAllowlist(conn.db, "other-org", "acme-corp");

      const result = await auditCrossRepoCorrelation(tmpDir);
      expect(result.pass).toBe(true);
    });
  });

  describe("leak detection", () => {
    it("detects leak: public blueprint has unredacted slug of private target", async () => {
      insertBlueprint(conn.db, "bp-public", "acme-corp", "public");
      insertWorkspaceRepo(
        conn.db,
        "other-org/private-repo",
        "other-org",
        "private-repo",
        "private",
      );
      // is_redacted=0 but target is private
      insertCrossRepoDep(conn.db, "bp-public", "other-org/private-repo", "secret-slug", null, 1, 0);

      const result = await auditCrossRepoCorrelation(tmpDir);
      expect(result.pass).toBe(false);
      expect(result.leaks).toHaveLength(1);
      expect(result.leaks[0]?.blueprintSlug).toBe("bp-public");
      expect(result.leaks[0]?.targetSlug).toBe("secret-slug");
      expect(result.leaks[0]?.targetRepo).toBe("other-org/private-repo");
    });

    it("does NOT flag as leak when target is public", async () => {
      insertBlueprint(conn.db, "bp-public", "acme-corp", "public");
      insertWorkspaceRepo(conn.db, "other-org/pub-repo", "other-org", "pub-repo", "public");
      insertCrossRepoDep(conn.db, "bp-public", "other-org/pub-repo", "open-slug", null, 1, 0);

      const result = await auditCrossRepoCorrelation(tmpDir);
      expect(result.leaks).toHaveLength(0);
    });

    it("does NOT flag as leak when already redacted (is_redacted=1)", async () => {
      insertBlueprint(conn.db, "bp-public", "acme-corp", "public");
      insertWorkspaceRepo(
        conn.db,
        "other-org/private-repo",
        "other-org",
        "private-repo",
        "private",
      );
      insertCrossRepoDep(conn.db, "bp-public", "other-org/private-repo", null, "hash123", 1, 1);

      const result = await auditCrossRepoCorrelation(tmpDir);
      expect(result.leaks).toHaveLength(0);
    });

    it("does NOT flag as leak when source blueprint is private", async () => {
      insertBlueprint(conn.db, "bp-private", "acme-corp", "private");
      insertWorkspaceRepo(
        conn.db,
        "other-org/private-repo",
        "other-org",
        "private-repo",
        "private",
      );
      insertCrossRepoDep(conn.db, "bp-private", "other-org/private-repo", "some-slug", null, 1, 0);

      const result = await auditCrossRepoCorrelation(tmpDir);
      expect(result.leaks).toHaveLength(0);
    });
  });

  describe("missing allowlist detection", () => {
    it("flags missing allowlist for cross-org dep without any allowlist entries", async () => {
      insertBlueprint(conn.db, "bp-a", "acme-corp", "public");
      insertCrossRepoDep(conn.db, "bp-a", "other-org/repo", null, "hash", 1, 1);

      const result = await auditCrossRepoCorrelation(tmpDir);
      expect(result.pass).toBe(false);
      expect(result.missingAllowlists).toHaveLength(1);
      expect(result.missingAllowlists[0]?.sourceOrg).toBe("acme-corp");
      expect(result.missingAllowlists[0]?.targetOrg).toBe("other-org");
      expect(result.missingAllowlists[0]?.missingSides).toContain("source");
      expect(result.missingAllowlists[0]?.missingSides).toContain("target");
    });

    it("flags missing allowlist when only source permits target (one-sided)", async () => {
      insertBlueprint(conn.db, "bp-a", "acme-corp", "public");
      insertCrossRepoDep(conn.db, "bp-a", "other-org/repo", null, "hash", 1, 1);
      insertAllowlist(conn.db, "acme-corp", "other-org");
      // target side missing

      const result = await auditCrossRepoCorrelation(tmpDir);
      expect(result.missingAllowlists).toHaveLength(1);
      expect(result.missingAllowlists[0]?.missingSides).toStrictEqual(["target"]);
    });

    it("flags missing allowlist when only target permits source (one-sided)", async () => {
      insertBlueprint(conn.db, "bp-a", "acme-corp", "public");
      insertCrossRepoDep(conn.db, "bp-a", "other-org/repo", null, "hash", 1, 1);
      insertAllowlist(conn.db, "other-org", "acme-corp");
      // source side missing

      const result = await auditCrossRepoCorrelation(tmpDir);
      expect(result.missingAllowlists).toHaveLength(1);
      expect(result.missingAllowlists[0]?.missingSides).toStrictEqual(["source"]);
    });
  });

  describe("4-org fixture", () => {
    /**
     * acme-corp ←→ trusted-partner (mutual allowlist)
     * acme-corp → other-org (no allowlist)
     * acme-corp → random-stranger (no allowlist)
     */
    it("passes for trusted-partner, fails for other-org and random-stranger", async () => {
      insertBlueprint(conn.db, "bp-main", "acme-corp", "public");

      insertCrossRepoDep(conn.db, "bp-main", "trusted-partner/repo", null, "h1", 1, 1);
      insertCrossRepoDep(conn.db, "bp-main", "other-org/repo", null, "h2", 1, 1);
      insertCrossRepoDep(conn.db, "bp-main", "random-stranger/repo", null, "h3", 1, 1);

      // Only trusted-partner gets the mutual allowlist
      insertAllowlist(conn.db, "acme-corp", "trusted-partner");
      insertAllowlist(conn.db, "trusted-partner", "acme-corp");

      const result = await auditCrossRepoCorrelation(tmpDir);
      expect(result.pass).toBe(false);

      const failedOrgs = result.missingAllowlists.map((m) => m.targetOrg).sort();
      expect(failedOrgs).toContain("other-org");
      expect(failedOrgs).toContain("random-stranger");

      const passedOrgs = failedOrgs.filter((o) => o === "trusted-partner");
      expect(passedOrgs).toHaveLength(0);
    });
  });
});

// ---------------------------------------------------------------------------
// fixCrossRepoLeak
// ---------------------------------------------------------------------------

describe("fixCrossRepoLeak", () => {
  it("returns fixed=false when DB does not exist", async () => {
    const emptyDir = mkdtempSync(path.join(tmpdir(), "wp-fix-empty-"));
    try {
      const result = await fixCrossRepoLeak(emptyDir, "some-slug");
      expect(result.fixed).toBe(false);
    } finally {
      rmSync(emptyDir, { recursive: true, force: true });
    }
  });

  it("redacts an unredacted cross-repo dep and sets target_slug_hash", async () => {
    insertBlueprint(conn.db, "bp-public", "acme-corp", "public");
    insertCrossRepoDep(conn.db, "bp-public", "other-org/private-repo", "secret-slug", null, 1, 0);

    const result = await fixCrossRepoLeak(tmpDir, "bp-public");
    expect(result.fixed).toBe(true);

    // Verify the row was updated
    const row = conn.db
      .prepare(
        "SELECT target_slug, target_slug_hash, is_redacted FROM cross_repo_dependencies WHERE blueprint_slug = ?",
      )
      .get("bp-public") as {
      target_slug: string | null;
      target_slug_hash: string | null;
      is_redacted: number;
    };

    expect(row.target_slug).toBeNull();
    expect(row.target_slug_hash).toBeTruthy();
    expect(row.is_redacted).toBe(1);
  });

  it("returns fixed=false when no unredacted rows found", async () => {
    insertBlueprint(conn.db, "bp-public", "acme-corp", "public");
    insertCrossRepoDep(conn.db, "bp-public", "other-org/repo", null, "h1", 1, 1);

    const result = await fixCrossRepoLeak(tmpDir, "bp-public");
    expect(result.fixed).toBe(false);
  });
});
