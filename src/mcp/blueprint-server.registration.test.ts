import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { resolveBlueprintProjectionDbPath } from "#db/paths.js";

import {
  cleanupTempDir,
  createTempBlueprintRepo,
  makeRegistrar,
  writeStaleProjectionMetadata,
} from "./blueprint-server.test-harness.js";
import { registerBlueprintTools } from "./blueprint-server.js";

describe("registerBlueprintTools bootstrap", () => {
  let cwd: string | undefined;

  afterEach(() => {
    cleanupTempDir(cwd);
    cwd = undefined;
  });

  it("registers the blueprint tool surface without creating or refreshing projections", async () => {
    cwd = createTempBlueprintRepo("wp-bs-registration-");
    const dbPath = resolveBlueprintProjectionDbPath(cwd);
    const { registrar, tools } = makeRegistrar();

    expect(existsSync(dbPath)).toBe(false);

    await registerBlueprintTools(registrar, cwd);

    expect(existsSync(dbPath)).toBe(false);
    expect([...tools.keys()].sort((a, b) => a.localeCompare(b))).toStrictEqual([
      "wp_blueprint_context",
      "wp_blueprint_create",
      "wp_blueprint_depgraph",
      "wp_blueprint_finalize",
      "wp_blueprint_get",
      "wp_blueprint_list",
      "wp_blueprint_new",
      "wp_blueprint_promote",
      "wp_blueprint_put",
      "wp_blueprint_query",
      "wp_blueprint_task_advance",
      "wp_blueprint_task_next",
      "wp_blueprint_task_verify",
      "wp_blueprint_transition",
      "wp_blueprint_validate",
    ]);
    expect(tools.has("wp_blueprint_patch")).toBe(false);
    expect(tools.has("wp_blueprint_write_markdown")).toBe(false);
  });

  it("does not hide stale-read contract issues by doing eager registration-time repair", async () => {
    cwd = createTempBlueprintRepo("wp-bs-registration-stale-");
    const dbPath = resolveBlueprintProjectionDbPath(cwd);
    const { registrar, tools } = makeRegistrar();
    mkdirSync(path.dirname(dbPath), { recursive: true });
    writeFileSync(dbPath, "", "utf8");
    writeStaleProjectionMetadata(cwd);
    const staleMetadata = readFileSync(`${dbPath}.meta.json`, "utf8");

    await registerBlueprintTools(registrar, cwd);

    expect(existsSync(dbPath)).toBe(true);
    expect(readFileSync(`${dbPath}.meta.json`, "utf8")).toBe(staleMetadata);
    expect(tools.has("wp_blueprint_list")).toBe(true);
  });
});
