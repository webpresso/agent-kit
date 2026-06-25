import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "../..");

const DOC_FILES = [
  "commands/blueprint.md",
  "docs/architecture.md",
  "docs/blueprint-db-cookbook.md",
] as const;

const REQUIRED_CANONICAL_TOOLS = [
  "wp_blueprint_projects",
  "wp_blueprint_list",
  "wp_blueprint_get",
  "wp_blueprint_context",
  "wp_blueprint_create",
  "wp_blueprint_put",
  "wp_blueprint_transition",
  "wp_blueprint_task_advance",
  "wp_blueprint_task_verify",
] as const;

function read(rel: string): string {
  return readFileSync(path.join(root, rel), "utf8");
}

function extractToolNames(text: string, prefix: "wp" | "ak"): string[] {
  return [
    ...new Set(text.match(new RegExp(`\\b${prefix}_blueprint_[a-z_]+\\b`, "g")) ?? []),
  ].sort();
}

describe("blueprint docs drift", () => {
  it("documents the canonical wp_blueprint tool set across command/docs surfaces", () => {
    const union = new Set<string>();
    for (const rel of DOC_FILES) {
      for (const name of extractToolNames(read(rel), "wp")) {
        union.add(name);
      }
    }

    expect([...union].sort()).toEqual(expect.arrayContaining([...REQUIRED_CANONICAL_TOOLS]));
  });

  it("does not document legacy ak_blueprint names in canonical docs", () => {
    for (const rel of DOC_FILES) {
      expect(extractToolNames(read(rel), "ak")).toEqual([]);
    }
  });

  it("documents request_id on mutation tools", () => {
    const commandsDoc = read("commands/blueprint.md");
    expect(commandsDoc).toContain("request_id");
    expect(commandsDoc).toContain("wp_blueprint_create");
    expect(commandsDoc).toContain("wp_blueprint_put");
    expect(commandsDoc).toContain("wp_blueprint_task_advance");
    expect(commandsDoc).toContain("wp_blueprint_task_verify");
  });

  it("documents head_at_ingest for stale-write-safe mutations", () => {
    const commandsDoc = read("commands/blueprint.md");
    expect(commandsDoc).toContain("head_at_ingest");
    expect(commandsDoc).toContain("wp_blueprint_list");
    expect(commandsDoc).toContain("wp_blueprint_get");
  });

  it("documents the v1 put/transition boundary and deferred semantic patch model", () => {
    const commandsDoc = read("commands/blueprint.md");
    expect(commandsDoc).toContain("wp_blueprint_put");
    expect(commandsDoc).toContain("wp_blueprint_transition");
    expect(commandsDoc).toContain("wp_blueprint_patch");
    expect(commandsDoc).toContain("semantic");
    expect(commandsDoc).toContain("add_task");
    expect(commandsDoc).toContain("update_task");
    expect(commandsDoc).toContain("set_summary");
    expect(commandsDoc).toContain("replace_decision");
    expect(commandsDoc).toContain("is **not** part of the v1 canonical surface");
  });

  it("documents MCP Apps as an optional follow-on layered over the structured tools", () => {
    const commandsDoc = read("commands/blueprint.md");
    const lifecycleDoc = read("docs/lifecycle.md");

    expect(commandsDoc).toContain("MCP Apps");
    expect(commandsDoc).toContain("enhancement");
    expect(commandsDoc).toContain("Hosts without MCP Apps support");
    expect(commandsDoc).toContain("wp_blueprint_put");
    expect(commandsDoc).toContain("wp_blueprint_transition");

    expect(lifecycleDoc).toContain("MCP Apps editor follow-on (v2)");
    expect(lifecycleDoc).toContain("follow-on enhancement");
    expect(lifecycleDoc).toContain("do not support MCP Apps");
    expect(lifecycleDoc).toContain("wp_blueprint_put");
    expect(lifecycleDoc).toContain("wp_blueprint_transition");
  });

  it("contains no stale legacy facade references", () => {
    const commandsDoc = read("commands/blueprint.md");
    const matches = [...new Set(commandsDoc.match(/\bmcp__[a-z-]+__wp_blueprint\b/g) ?? [])];
    expect(matches).toEqual([]);
  });
});
