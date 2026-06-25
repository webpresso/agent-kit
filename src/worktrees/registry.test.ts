import { mkdtempSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  deriveRepoNamespace,
  resolveManagedWorktreeRoot,
  resolveOwnerWorktreePath,
  resolveScratchWorktreePath,
  resolveWorktreeRoot,
} from "./location.js";
import {
  pruneStaleWorktreeRegistryEntries,
  readWorktreeRegistry,
  upsertWorktreeRegistryEntry,
} from "./registry.js";

describe("managed worktree location policy", () => {
  it("uses a fixed user-global root", () => {
    expect(resolveManagedWorktreeRoot("/home/alice")).toBe("/home/alice/.agent/worktrees");
  });

  it("namespaces repos from origin URL with a collision-resistant suffix", () => {
    const namespace = deriveRepoNamespace({
      repoRoot: "/repos/agent-kit",
      originUrl: "git@github.com:webpresso/agent-kit.git",
    });

    expect(namespace).toMatch(/^github\.com-webpresso-agent-kit-[a-f0-9]{10}$/);
    expect(
      resolveWorktreeRoot("/repos/agent-kit", {
        homeDir: "/home/alice",
        originUrl: "git@github.com:webpresso/agent-kit.git",
      }),
    ).toBe(`/home/alice/.agent/worktrees/repos/${namespace}`);
  });

  it("falls back to stable local repo identity when origin is unavailable", () => {
    expect(deriveRepoNamespace({ repoRoot: "/repos/a/agent-kit" })).not.toBe(
      deriveRepoNamespace({ repoRoot: "/repos/b/agent-kit" }),
    );
  });

  it("resolves owner and hidden scratch paths below the namespaced repo root", () => {
    const opts = {
      homeDir: "/home/alice",
      originUrl: "https://github.com/webpresso/agent-kit.git",
    };
    const owner = resolveOwnerWorktreePath("/repos/agent-kit", "my-blueprint", opts);
    expect(owner).toMatch(
      /^\/home\/alice\/\.agent\/worktrees\/repos\/github\.com-webpresso-agent-kit-[a-f0-9]{10}\/blueprints\/my-blueprint\/owner$/,
    );
    expect(
      resolveScratchWorktreePath("/repos/agent-kit", "my-blueprint", "lint lane", "abc", opts),
    ).toBe(owner.replace(/\/owner$/, "/.scratch/lint-lane-abc"));
  });
});

describe("worktree registry", () => {
  const roots: string[] = [];

  afterEach(() => {
    for (const root of roots) rmSync(root, { recursive: true, force: true });
    roots.length = 0;
  });

  function tempRoot(): string {
    const root = mkdtempSync(join(tmpdir(), "wp-worktree-registry-"));
    roots.push(root);
    return root;
  }

  it("upserts entries and returns them from the cache-backed inventory", () => {
    const root = tempRoot();
    upsertWorktreeRegistryEntry(
      {
        id: "owner-1",
        repoNamespace: "repo-a",
        repoRoot: "/repo/a",
        kind: "owner",
        path: "/worktrees/a",
        branch: "bp/a",
        blueprintSlug: "a",
      },
      { root, now: () => "2026-06-12T00:00:00.000Z" },
    );

    expect(readWorktreeRegistry({ root }).entries).toStrictEqual([
      {
        id: "owner-1",
        repoNamespace: "repo-a",
        repoRoot: "/repo/a",
        kind: "owner",
        path: "/worktrees/a",
        branch: "bp/a",
        blueprintSlug: "a",
        createdAt: "2026-06-12T00:00:00.000Z",
        updatedAt: "2026-06-12T00:00:00.000Z",
      },
    ]);
  });

  it("prunes stale cache entries without probing the world", () => {
    const root = tempRoot();
    const live = join(root, "live");
    mkdirSync(live, { recursive: true });
    upsertWorktreeRegistryEntry(
      {
        id: "live",
        repoNamespace: "repo-a",
        repoRoot: "/repo/a",
        kind: "owner",
        path: live,
      },
      { root },
    );
    upsertWorktreeRegistryEntry(
      {
        id: "stale",
        repoNamespace: "repo-a",
        repoRoot: "/repo/a",
        kind: "scratch",
        path: join(root, "missing"),
      },
      { root },
    );

    const result = pruneStaleWorktreeRegistryEntries({ root });
    expect(result.kept.map((entry) => entry.id)).toStrictEqual(["live"]);
    expect(result.removed.map((entry) => entry.id)).toStrictEqual(["stale"]);
    expect(readWorktreeRegistry({ root }).entries.map((entry) => entry.id)).toStrictEqual(["live"]);
  });
});
