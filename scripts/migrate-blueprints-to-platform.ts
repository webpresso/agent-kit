#!/usr/bin/env bun
/**
 * scripts/migrate-blueprints-to-platform.ts — one-shot idempotent migration.
 *
 * Reads all existing blueprint `_overview.md` files, parses frontmatter, and
 * pushes a `blueprint.created` event for each to the platform.
 *
 * Idempotency: `eventId` is a deterministic sha256 hex of the blueprint slug,
 * so re-running never creates duplicates (platform deduplicates on `eventId`).
 *
 * Disabled path: when `loadSyncCredentials()` returns `null` (either
 * `WP_BLUEPRINT_PLATFORM_DISABLED=1` or no token), logs and exits 0.
 */

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join } from "node:path";

import { loadSyncCredentials } from "../src/blueprint/sync/auth.js";
import { BlueprintSyncClient } from "../src/blueprint/sync/client.js";
import type { BlueprintPlatformEvent } from "../src/blueprint/sync/types.js";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const BLUEPRINT_DIRS = [
  "completed",
  "in-progress",
  "planned",
  "parked",
  "draft",
  "archived",
] as const;

const HISTORICAL_OCCURRED_AT = "2026-01-01T00:00:00.000Z";

// ---------------------------------------------------------------------------
// Frontmatter parsing
// ---------------------------------------------------------------------------

interface ParsedFrontmatter {
  readonly title: string;
  readonly status: string;
  readonly complexity: string;
}

/**
 * Extract the YAML frontmatter block (between first and second `---`) from
 * markdown content. Returns `null` if no frontmatter is found.
 */
function extractFrontmatterBlock(content: string): string | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(content);
  return match?.[1] ?? null;
}

/**
 * Parse `key: value` lines from a YAML block into a plain record.
 * Values are trimmed and unquoted (single or double quotes stripped).
 */
function parseYamlKeyValues(block: string): Readonly<Record<string, string>> {
  const result: Record<string, string> = {};
  for (const line of block.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const raw = line.slice(colonIdx + 1).trim();
    // Strip surrounding quotes
    const value = raw.replace(/^['"]|['"]$/g, "");
    if (key.length > 0 && value.length > 0) {
      result[key] = value;
    }
  }
  return result;
}

/**
 * Parse frontmatter from a `_overview.md` file content.
 * Returns `null` when required fields are missing or unparseable.
 */
export function parseFrontmatter(content: string): ParsedFrontmatter | null {
  const block = extractFrontmatterBlock(content);
  if (block === null) return null;

  const kv = parseYamlKeyValues(block);
  const title = kv["title"] ?? "";
  const status = kv["status"] ?? "";
  const complexity = kv["complexity"] ?? "";

  if (status.length === 0 || complexity.length === 0) return null;

  return { title, status, complexity };
}

// ---------------------------------------------------------------------------
// Slug derivation
// ---------------------------------------------------------------------------

/**
 * The slug is the directory name that contains `_overview.md`.
 * e.g. `blueprints/completed/agent-kit-parity-pass/_overview.md` → `agent-kit-parity-pass`
 */
export function slugFromPath(overviewPath: string): string {
  const parts = overviewPath.replace(/\\/g, "/").split("/");
  // `_overview.md` is the last segment; parent dir is the slug
  const parentDir = parts[parts.length - 2];
  return parentDir ?? "";
}

// ---------------------------------------------------------------------------
// Event ID derivation
// ---------------------------------------------------------------------------

/**
 * Deterministic eventId: sha256 hex of the slug.
 * The platform deduplicates on `eventId`, so re-running is safe.
 */
export function deriveEventId(slug: string): string {
  return createHash("sha256").update(slug).digest("hex");
}

// ---------------------------------------------------------------------------
// Blueprint discovery
// ---------------------------------------------------------------------------

export interface DiscoveredBlueprint {
  readonly slug: string;
  readonly overviewPath: string;
  readonly frontmatter: ParsedFrontmatter;
}

/**
 * Scan the `blueprints/` subdirectories for `_overview.md` files.
 * Returns one entry per discovered blueprint (skips files with missing/invalid
 * frontmatter).
 */
export function discoverBlueprints(repoRoot: string): readonly DiscoveredBlueprint[] {
  const results: DiscoveredBlueprint[] = [];

  for (const dir of BLUEPRINT_DIRS) {
    const dirPath = join(repoRoot, "blueprints", dir);

    let entries: string[];
    try {
      entries = readdirSync(dirPath);
    } catch {
      // Directory may not exist — skip silently
      continue;
    }

    for (const entry of entries) {
      const blueprintDir = join(dirPath, entry);
      let stat;
      try {
        stat = statSync(blueprintDir);
      } catch {
        continue;
      }
      if (!stat.isDirectory()) continue;

      const overviewPath = join(blueprintDir, "_overview.md");
      let content: string;
      try {
        content = readFileSync(overviewPath, "utf8");
      } catch {
        continue;
      }

      const frontmatter = parseFrontmatter(content);
      if (frontmatter === null) {
        console.warn(`[migrate] Skipping ${overviewPath}: missing/invalid frontmatter`);
        continue;
      }

      const slug = slugFromPath(overviewPath);
      if (slug.length === 0) {
        console.warn(`[migrate] Skipping ${overviewPath}: could not derive slug`);
        continue;
      }

      results.push({ slug, overviewPath, frontmatter });
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Event builder
// ---------------------------------------------------------------------------

export function buildEvent(blueprint: DiscoveredBlueprint, repoId: string): BlueprintPlatformEvent {
  const eventId = deriveEventId(blueprint.slug);
  const { title, status, complexity } = blueprint.frontmatter;

  return {
    eventId,
    repoId,
    occurredAt: HISTORICAL_OCCURRED_AT,
    type: "blueprint.created",
    payload: {
      type: "blueprint.created",
      slug: blueprint.slug,
      title,
      complexity,
      status,
    },
  };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function migrate(repoRoot: string, fetchFn?: typeof fetch): Promise<void> {
  const creds = loadSyncCredentials();
  if (creds === null) {
    console.log(
      "[migrate] Platform sync is disabled or no token configured " +
        "(WP_BLUEPRINT_PLATFORM_DISABLED=1 or WP_BLUEPRINT_PLATFORM_TOKEN not set). " +
        "Nothing to do.",
    );
    return;
  }

  const client =
    fetchFn !== undefined
      ? new BlueprintSyncClient(creds, fetchFn)
      : new BlueprintSyncClient(creds);

  const blueprints = discoverBlueprints(repoRoot);
  console.log(`[migrate] Found ${blueprints.length} blueprint(s) to migrate.`);

  let pushed = 0;
  for (const blueprint of blueprints) {
    const event = buildEvent(blueprint, creds.repoId);
    try {
      await client.pushEvent(event);
      console.log(`[migrate] ✓ ${blueprint.slug} (eventId: ${event.eventId.slice(0, 8)}...)`);
      pushed++;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[migrate] ✗ ${blueprint.slug}: ${message}`);
    }
  }

  console.log(`[migrate] Done. Pushed ${pushed}/${blueprints.length} blueprint(s).`);
}

// ---------------------------------------------------------------------------
// CLI entry point
// ---------------------------------------------------------------------------

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const repoRoot = dirname(import.meta.dirname);
  await migrate(repoRoot);
}
