import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  assertBuiltBlueprintMigrationSqlAssets,
  PACKAGED_BLUEPRINT_MIGRATIONS_RELATIVE_DIR,
  SOURCE_BLUEPRINT_MIGRATIONS_RELATIVE_DIR,
  syncBlueprintMigrationSqlAssets,
} from "./blueprint-migration-assets.js";

describe("blueprint migration asset sync", () => {
  it("copies source SQL assets into dist and removes stale packaged SQL files", () => {
    const root = mkdtempSync(join(tmpdir(), "wp-blueprint-migration-sync-"));
    const sourceDir = join(root, SOURCE_BLUEPRINT_MIGRATIONS_RELATIVE_DIR);
    const distDir = join(root, PACKAGED_BLUEPRINT_MIGRATIONS_RELATIVE_DIR);

    try {
      mkdirSync(sourceDir, { recursive: true });
      mkdirSync(distDir, { recursive: true });
      writeFileSync(join(sourceDir, "0001_seed.sql"), "CREATE TABLE blueprints();\n");
      writeFileSync(join(sourceDir, "0002_request_id_ledger.sql"), "CREATE TABLE ledger();\n");
      writeFileSync(join(distDir, "stale.sql"), "DROP TABLE stale;\n");
      writeFileSync(join(distDir, "run.js"), "export {};\n");

      syncBlueprintMigrationSqlAssets(root);

      expect(readFileSync(join(distDir, "0001_seed.sql"), "utf8")).toContain(
        "CREATE TABLE blueprints",
      );
      expect(readFileSync(join(distDir, "0002_request_id_ledger.sql"), "utf8")).toContain(
        "CREATE TABLE ledger",
      );
      expect(existsSync(join(distDir, "stale.sql"))).toBe(false);
      expect(existsSync(join(distDir, "run.js"))).toBe(true);
      expect(() => assertBuiltBlueprintMigrationSqlAssets(root)).not.toThrow();
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
