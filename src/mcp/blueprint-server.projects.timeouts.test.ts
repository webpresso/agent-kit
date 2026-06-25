import { mkdtempSync, mkdirSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import type { ProjectResolver } from "#project-resolver.js";

import { callTool, makeRegistrar, parseResult } from "./blueprint-server.test-harness.js";
import { registerBlueprintServer } from "./blueprint-server.js";

let tmpDir: string;
beforeEach(async () => {
  tmpDir = mkdtempSync(path.join(tmpdir(), "wp-bs-projects-timeouts-"));
  mkdirSync(path.join(tmpDir, ".agent"), { recursive: true });
  mkdirSync(path.join(tmpDir, "blueprints", "draft"), { recursive: true });
  writeFileSync(path.join(tmpDir, "package.json"), JSON.stringify({ name: "test" }), "utf8");
});

afterEach(() => {
  rmSync(tmpDir, { recursive: true, force: true });
});

describe("bounded roots/discovery guard lane", () => {
  it("wp_blueprint_projects degrades roots fetch timeouts to warnings and partial results", async () => {
    const oldTimeout = process.env.WP_BLUEPRINT_ROOTS_TIMEOUT_MS;
    process.env.WP_BLUEPRINT_ROOTS_TIMEOUT_MS = "1";

    try {
      const { registrar, tools: localTools } = makeRegistrar();
      await registerBlueprintServer(registrar, {
        cwd: tmpDir,
        existingToolNames: new Set(),
        getMcpRoots: () => new Promise(() => undefined),
      });

      const result = await callTool(localTools, "wp_blueprint_projects", {});
      const currentProjectPath = realpathSync(tmpDir);
      const data = parseResult<{
        projects: Array<{ worktree_path: string }>;
        warnings: string[];
      }>(result);

      expect(data.warnings).toContain("roots_fetch_timeout");
      expect(data.projects.some((project) => project.worktree_path === currentProjectPath)).toBe(
        true,
      );
    } finally {
      if (oldTimeout === undefined) delete process.env.WP_BLUEPRINT_ROOTS_TIMEOUT_MS;
      else process.env.WP_BLUEPRINT_ROOTS_TIMEOUT_MS = oldTimeout;
    }
  });

  it("wp_blueprint_projects degrades project discovery timeouts to current-project partials", async () => {
    const oldTimeout = process.env.WP_BLUEPRINT_PROJECT_DISCOVERY_TIMEOUT_MS;
    process.env.WP_BLUEPRINT_PROJECT_DISCOVERY_TIMEOUT_MS = "1";

    const hangingResolver: ProjectResolver = {
      listVisibleProjects: () => new Promise(() => undefined),
      resolve: async () => ({ ok: true, cwd: tmpDir, project_id: null }),
      warm: () => undefined,
      invalidate: () => undefined,
    };

    try {
      const { registrar, tools: localTools } = makeRegistrar();
      await registerBlueprintServer(registrar, {
        cwd: tmpDir,
        existingToolNames: new Set(),
        projectResolver: hangingResolver,
      });

      const result = await callTool(localTools, "wp_blueprint_projects", {});
      const currentProjectPath = realpathSync(tmpDir);
      const data = parseResult<{
        projects: Array<{ worktree_path: string }>;
        warnings: string[];
      }>(result);

      expect(data.warnings).toContain("project_discovery_timeout");
      expect(data.projects).toHaveLength(1);
      expect(data.projects[0]?.worktree_path).toBe(currentProjectPath);
    } finally {
      if (oldTimeout === undefined) delete process.env.WP_BLUEPRINT_PROJECT_DISCOVERY_TIMEOUT_MS;
      else process.env.WP_BLUEPRINT_PROJECT_DISCOVERY_TIMEOUT_MS = oldTimeout;
    }
  });
});
