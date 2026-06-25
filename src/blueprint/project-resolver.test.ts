import { mkdtempSync, mkdirSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path, { join } from "node:path";

import { afterEach, describe, expect, it, vi } from "vitest";

import { PROJECT_SOURCES, type BlueprintProjectRef } from "#projects.js";

import { createProjectResolver } from "./project-resolver.js";

const createdRoots: string[] = [];

function mkroot(prefix = "wp-project-resolver-"): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  createdRoots.push(dir);
  return realpathSync(dir);
}

afterEach(() => {
  while (createdRoots.length > 0) {
    const dir = createdRoots.pop();
    if (!dir) continue;
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // best-effort cleanup
    }
  }
});

function projectRef(root: string, source: BlueprintProjectRef["source"]): BlueprintProjectRef {
  return {
    project_id: "abc123def4567890",
    label: path.basename(root),
    repo_path: root,
    worktree_path: root,
    source,
    has_blueprints: true,
    db_path: join(root, ".agent", ".blueprints.db"),
  };
}

describe("createProjectResolver", () => {
  it("returns an explicit real path without broad discovery", async () => {
    const cwd = mkroot("resolver-cwd-");
    const target = mkroot("resolver-target-");

    const resolveProjects = vi.fn(async (): Promise<readonly BlueprintProjectRef[]> => []);
    const resolver = createProjectResolver({ resolveProjects });

    const result = await resolver.resolve({ cwd, projectId: target });

    expect(result).toEqual({ ok: true, cwd: target, project_id: null });
    expect(resolveProjects).not.toHaveBeenCalled();
  });

  it("warms and reuses the recent project index across different cwd values", async () => {
    const workspace = mkroot("resolver-workspace-");
    const unrelated = mkroot("resolver-unrelated-");
    const target = mkroot("resolver-target-");
    mkdirSync(join(target, ".agent"), { recursive: true });

    const ref = projectRef(target, PROJECT_SOURCES.current);
    const resolveProjects = vi
      .fn<(_: unknown) => Promise<readonly BlueprintProjectRef[]>>()
      .mockResolvedValue([ref]);

    const resolver = createProjectResolver({ resolveProjects });

    const warmed = await resolver.listVisibleProjects({ cwd: workspace });
    expect(warmed).toHaveLength(1);
    expect(resolveProjects).toHaveBeenCalledTimes(1);

    const resolved = await resolver.resolve({ cwd: unrelated, projectId: ref.project_id });
    expect(resolved).toEqual({ ok: true, cwd: target, project_id: ref.project_id });
    expect(resolveProjects).toHaveBeenCalledTimes(1);
  });

  it("falls back to discovery once when an explicit project_id is not yet warmed", async () => {
    const workspace = mkroot("resolver-workspace-");
    const target = mkroot("resolver-target-");
    const ref = projectRef(target, PROJECT_SOURCES.current);

    const resolveProjects = vi
      .fn<(_: unknown) => Promise<readonly BlueprintProjectRef[]>>()
      .mockResolvedValue([ref]);

    const resolver = createProjectResolver({ resolveProjects });
    const result = await resolver.resolve({ cwd: workspace, projectId: ref.project_id });

    expect(result).toEqual({ ok: true, cwd: target, project_id: ref.project_id });
    expect(resolveProjects).toHaveBeenCalledTimes(1);
  });

  it("invalidates the warmed index explicitly", async () => {
    const workspace = mkroot("resolver-workspace-");
    const target = mkroot("resolver-target-");
    const ref = projectRef(target, PROJECT_SOURCES.current);

    const resolveProjects = vi
      .fn<(_: unknown) => Promise<readonly BlueprintProjectRef[]>>()
      .mockResolvedValue([ref]);

    const resolver = createProjectResolver({ resolveProjects });
    await resolver.listVisibleProjects({ cwd: workspace });
    expect(resolveProjects).toHaveBeenCalledTimes(1);

    resolver.invalidate();
    await resolver.resolve({ cwd: workspace, projectId: ref.project_id });
    expect(resolveProjects).toHaveBeenCalledTimes(2);
  });
});
