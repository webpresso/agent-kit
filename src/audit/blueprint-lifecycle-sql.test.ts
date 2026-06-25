import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { tmpdir } from "node:os";

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:child_process")>();
  return {
    ...actual,
    execFileSync(command: string, args: readonly string[] = [], options?: unknown) {
      if (command !== "git" || process.env.WP_FAKE_GIT_ACTIVE !== "1") {
        return actual.execFileSync(command, [...args], options as never);
      }
      const [subcommand, second] = args;
      if (subcommand === "rev-parse" && second === "--show-toplevel") return process.cwd();
      if (subcommand === "log") {
        return process.env.WP_FAKE_GIT_LAST_TOUCH_ISO ?? "2030-01-01T12:00:00+00:00";
      }
      if (subcommand === "merge-base") {
        if (process.env.WP_FAKE_GIT_MERGE_BASE === "__NULL__") {
          throw new Error("fake merge-base miss");
        }
        return process.env.WP_FAKE_GIT_MERGE_BASE ?? "fake-base";
      }
      if (subcommand === "remote" && second === "get-url") {
        return "git@github.com:webpresso/agent-kit.git";
      }
      if (subcommand === "diff-tree") return process.env.WP_FAKE_GIT_DIFF_TREE ?? "";
      if (subcommand === "diff") {
        return args.includes("--cached")
          ? (process.env.WP_FAKE_GIT_STAGED_DIFF ?? "")
          : (process.env.WP_FAKE_GIT_BASE_DIFF ?? "");
      }
      if (subcommand === "status") {
        if (process.env.WP_FAKE_GIT_STATUS_ERROR === "1") throw new Error("fake status failure");
        return process.env.WP_FAKE_GIT_STATUS ?? "";
      }
      if (subcommand === "ls-files") return process.env.WP_FAKE_GIT_TRACKED_FILES ?? "";
      if (subcommand === "show") {
        if (second !== process.env.WP_FAKE_GIT_SHOW_SPEC) throw new Error("fake show miss");
        return process.env.WP_FAKE_GIT_SHOW_CONTENT ?? "";
      }
      throw new Error(`unexpected fake git invocation: ${args.join(" ")}`);
    },
  };
});

import { auditBlueprintLifecycleSql } from "./blueprint-lifecycle-sql.js";

// ---------------------------------------------------------------------------
// Helpers
//
// The audit builds an EPHEMERAL in-memory projection from the repo's blueprint
// MARKDOWN (no persistent DB is read), so fixtures are markdown files under
// `blueprints/<status>/...`, not injected DB rows. A `package.json` anchors
// `resolveBlueprintRoot` to the temp dir.
// ---------------------------------------------------------------------------

function makeTempRepo(): string {
  const cwd = mkdtempSync(path.join(tmpdir(), "wp-audit-bp-lifecycle-"));
  writeFileSync(path.join(cwd, "package.json"), JSON.stringify({ name: "tmp-repo" }));
  mkdirSync(path.join(cwd, "blueprints"), { recursive: true });
  return cwd;
}

interface BlueprintFixture {
  status: string;
  /** Frontmatter `status:` value; defaults to the directory `status`. */
  frontmatterStatus?: string;
  /** Task blocks: each becomes a `#### Task X.Y` with the given **Status:**. */
  tasks?: ReadonlyArray<{ id: string; status: string }>;
}

function renderBlueprintMarkdown(slug: string, fx: BlueprintFixture): string {
  const fm = [
    "---",
    "type: blueprint",
    `title: Blueprint ${slug}`,
    "owner: tester",
    `status: ${fx.frontmatterStatus ?? fx.status}`,
    "complexity: S",
    'created: "2026-06-03"',
    'last_updated: "2026-06-03"',
    "---",
    "",
    `# Blueprint ${slug}`,
    "",
  ];
  const body: string[] = [];
  for (const task of fx.tasks ?? []) {
    body.push(
      `#### Task ${task.id}: Step ${task.id}`,
      "",
      `**Status:** ${task.status}`,
      "",
      "**Acceptance:**",
      "",
      "- [ ] done",
      "",
    );
  }
  return [...fm, ...body].join("\n");
}

/** Write a flat blueprint markdown file at `blueprints/<status>/<slug>.md`. */
function writeBlueprint(cwd: string, slug: string, fx: BlueprintFixture): void {
  const dir = path.join(cwd, "blueprints", fx.status);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, `${slug}.md`), renderBlueprintMarkdown(slug, fx));
}

interface FakeGitOptions {
  readonly baseDiff?: string;
  readonly diffTree?: string;
  readonly lastTouchIso?: string;
  readonly mergeBase?: string | null;
  readonly statusError?: boolean;
  readonly stagedDiff?: string;
  readonly status?: string;
  readonly trackedFiles?: readonly string[];
  readonly showBySpec?: Record<string, string>;
}

async function withFakeGit<T>(options: FakeGitOptions, run: () => Promise<T>): Promise<T> {
  mkdirSync(path.join(cwd, ".git"), { recursive: true });
  const showEntries = Object.entries(options.showBySpec ?? {});
  const [showSpec = "", showContent = ""] = showEntries[0] ?? [];

  const previousEnv = {
    PATH: process.env.PATH,
    WP_FAKE_GIT_ACTIVE: process.env.WP_FAKE_GIT_ACTIVE,
    WP_FAKE_GIT_BASE_DIFF: process.env.WP_FAKE_GIT_BASE_DIFF,
    WP_FAKE_GIT_DIFF_TREE: process.env.WP_FAKE_GIT_DIFF_TREE,
    WP_FAKE_GIT_LAST_TOUCH_ISO: process.env.WP_FAKE_GIT_LAST_TOUCH_ISO,
    WP_FAKE_GIT_MERGE_BASE: process.env.WP_FAKE_GIT_MERGE_BASE,
    WP_FAKE_GIT_STAGED_DIFF: process.env.WP_FAKE_GIT_STAGED_DIFF,
    WP_FAKE_GIT_STATUS_ERROR: process.env.WP_FAKE_GIT_STATUS_ERROR,
    WP_FAKE_GIT_STATUS: process.env.WP_FAKE_GIT_STATUS,
    WP_FAKE_GIT_TRACKED_FILES: process.env.WP_FAKE_GIT_TRACKED_FILES,
    WP_FAKE_GIT_SHOW_CONTENT: process.env.WP_FAKE_GIT_SHOW_CONTENT,
    WP_FAKE_GIT_SHOW_SPEC: process.env.WP_FAKE_GIT_SHOW_SPEC,
  };

  process.env.WP_FAKE_GIT_ACTIVE = "1";
  process.env.WP_FAKE_GIT_BASE_DIFF = options.baseDiff ?? "";
  process.env.WP_FAKE_GIT_DIFF_TREE = options.diffTree ?? "";
  process.env.WP_FAKE_GIT_LAST_TOUCH_ISO = options.lastTouchIso ?? "2030-01-01T12:00:00+00:00";
  process.env.WP_FAKE_GIT_MERGE_BASE = options.mergeBase ?? "__NULL__";
  process.env.WP_FAKE_GIT_STAGED_DIFF = options.stagedDiff ?? "";
  process.env.WP_FAKE_GIT_STATUS_ERROR = options.statusError ? "1" : "";
  process.env.WP_FAKE_GIT_STATUS = options.status ?? "";
  process.env.WP_FAKE_GIT_TRACKED_FILES = (options.trackedFiles ?? []).join("\n");
  process.env.WP_FAKE_GIT_SHOW_CONTENT = showContent;
  process.env.WP_FAKE_GIT_SHOW_SPEC = showSpec;

  try {
    return await run();
  } finally {
    for (const [key, value] of Object.entries(previousEnv)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function fakeRenameDiff(from: string, to: string): string {
  return `R100\t${from}\t${to}\n`;
}

let cwd: string;

beforeEach(() => {
  cwd = makeTempRepo();
});

afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
});

describe("auditBlueprintLifecycleSql — deterministic (markdown → ephemeral projection)", () => {
  it("returns ok when there are no blueprints", async () => {
    const result = await auditBlueprintLifecycleSql(cwd);
    expect(result.ok).toBe(true);
    expect(result.title).toBe("Blueprint lifecycle");
    expect(result.violations).toHaveLength(0);
  });

  it("reads no persistent DB — verdict comes purely from the markdown", async () => {
    writeBlueprint(cwd, "active-wip", {
      status: "in-progress",
      tasks: [{ id: "1.1", status: "todo" }],
    });
    const result = await auditBlueprintLifecycleSql(cwd);
    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("catches an in-progress blueprint with 0 tasks", async () => {
    writeBlueprint(cwd, "empty-wip", { status: "in-progress" });
    const result = await auditBlueprintLifecycleSql(cwd);
    expect(result.ok).toBe(false);
    expect(
      result.violations.some(
        (v) => v.message.includes("empty-wip") && /0 tasks|no tasks/i.test(v.message),
      ),
    ).toBe(true);
  });

  it("catches a status/directory mismatch (file in completed/ but status=in-progress)", async () => {
    writeBlueprint(cwd, "mismatched", {
      status: "completed",
      frontmatterStatus: "in-progress",
      tasks: [{ id: "1.1", status: "done" }],
    });
    const result = await auditBlueprintLifecycleSql(cwd);
    expect(result.ok).toBe(false);
    expect(
      result.violations.some(
        (v) =>
          v.message.includes("mismatched") &&
          /status|directory|completed|in-progress/i.test(v.message),
      ),
    ).toBe(true);
  });

  it("catches a completed blueprint whose tasks are not all done (progress_pct < 100)", async () => {
    writeBlueprint(cwd, "partial-done", {
      status: "completed",
      tasks: [
        { id: "1.1", status: "done" },
        { id: "1.2", status: "todo" },
      ],
    });
    const result = await auditBlueprintLifecycleSql(cwd);
    expect(result.ok).toBe(false);
    expect(
      result.violations.some(
        (v) => v.message.includes("partial-done") && /progress_pct|completed/i.test(v.message),
      ),
    ).toBe(true);
  });

  it("passes a completed blueprint whose tasks are all done", async () => {
    writeBlueprint(cwd, "fully-done", {
      status: "completed",
      tasks: [{ id: "1.1", status: "done" }],
    });
    const result = await auditBlueprintLifecycleSql(cwd);
    expect(result.violations.some((v) => v.message.includes("fully-done"))).toBe(false);
  });

  it("does not flag a completed blueprint whose remaining non-done task is intentionally dropped", async () => {
    writeBlueprint(cwd, "descoped-complete", {
      status: "completed",
      tasks: [
        { id: "1.1", status: "done" },
        { id: "1.2", status: "dropped" },
      ],
    });
    const result = await auditBlueprintLifecycleSql(cwd);
    expect(result.violations.some((v) => v.message.includes("descoped-complete"))).toBe(false);
  });

  it("catches an in-progress blueprint whose tasks are all done (finished, wrong lane)", async () => {
    writeBlueprint(cwd, "shipped-but-wip", {
      status: "in-progress",
      tasks: [
        { id: "1.1", status: "done" },
        { id: "1.2", status: "done" },
      ],
    });
    const result = await auditBlueprintLifecycleSql(cwd);
    expect(result.ok).toBe(false);
    expect(
      result.violations.some(
        (v) =>
          v.message.includes("shipped-but-wip") && /done\/dropped|in-progress/i.test(v.message),
      ),
    ).toBe(true);
  });

  it("treats a dropped task as terminal (done ∪ dropped) for the wrong-lane check", async () => {
    writeBlueprint(cwd, "descoped-wip", {
      status: "in-progress",
      tasks: [
        { id: "1.1", status: "done" },
        { id: "1.2", status: "dropped" },
      ],
    });
    const result = await auditBlueprintLifecycleSql(cwd);
    expect(result.violations.some((v) => v.message.includes("descoped-wip"))).toBe(true);
  });

  it("catches a completed blueprint with a non-terminal task (untruthful status)", async () => {
    writeBlueprint(cwd, "claims-done", {
      status: "completed",
      tasks: [
        { id: "1.1", status: "done" },
        { id: "1.2", status: "todo" },
      ],
    });
    const result = await auditBlueprintLifecycleSql(cwd);
    expect(result.ok).toBe(false);
    expect(
      result.violations.some(
        (v) => v.message.includes("claims-done") && /not done\/dropped|completed/i.test(v.message),
      ),
    ).toBe(true);
  });

  it("catches exceeding the in-progress WIP limit", async () => {
    for (const slug of ["wip-a", "wip-b", "wip-c", "wip-d"]) {
      writeBlueprint(cwd, slug, { status: "in-progress", tasks: [{ id: "1.1", status: "todo" }] });
    }
    const result = await auditBlueprintLifecycleSql(cwd);
    expect(result.ok).toBe(false);
    expect(
      result.violations.some(
        (v) =>
          /in-progress.*lane limit|lane limit/i.test(v.message) &&
          v.message.includes("blueprint-wip-in-progress-max"),
      ),
    ).toBe(true);
  });

  it("allows up to the WIP limit", async () => {
    for (const slug of ["wip-1", "wip-2", "wip-3"]) {
      writeBlueprint(cwd, slug, { status: "in-progress", tasks: [{ id: "1.1", status: "todo" }] });
    }
    const result = await auditBlueprintLifecycleSql(cwd);
    expect(result.violations.some((v) => /lane limit/i.test(v.message))).toBe(false);
  });

  it("changed-only ignores unrelated lifecycle debt", async () => {
    writeBlueprint(cwd, "unrelated-empty-wip", { status: "in-progress" });
    writeBlueprint(cwd, "changed-clean", {
      status: "completed",
      tasks: [{ id: "1.1", status: "done" }],
    });

    const result = await withFakeGit(
      {
        baseDiff: "M\tblueprints/completed/changed-clean.md\n",
        mergeBase: "fake-base",
        trackedFiles: [
          "blueprints/in-progress/unrelated-empty-wip.md",
          "blueprints/completed/changed-clean.md",
        ],
      },
      () => auditBlueprintLifecycleSql(cwd, { changedOnly: true, baseRef: "origin/main" }),
    );

    expect(result.ok).toBe(true);
    expect(result.title).toContain("changed-only: 1 blueprint");
    expect(result.violations.some((v) => v.message.includes("unrelated-empty-wip"))).toBe(false);
  });

  it("changed-only still fails changed blueprint lifecycle violations", async () => {
    writeBlueprint(cwd, "changed-empty-wip", { status: "in-progress" });
    writeBlueprint(cwd, "unrelated-clean", {
      status: "completed",
      tasks: [{ id: "1.1", status: "done" }],
    });

    const result = await withFakeGit(
      {
        baseDiff: "M\tblueprints/in-progress/changed-empty-wip.md\n",
        mergeBase: "fake-base",
        trackedFiles: [
          "blueprints/in-progress/changed-empty-wip.md",
          "blueprints/completed/unrelated-clean.md",
        ],
      },
      () => auditBlueprintLifecycleSql(cwd, { changedOnly: true, baseRef: "origin/main" }),
    );

    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => v.message.includes("changed-empty-wip"))).toBe(true);
    expect(result.violations.some((v) => v.message.includes("unrelated-clean"))).toBe(false);
  });

  it("respects the WIP budget override from .agent/.audit-budgets.yaml", async () => {
    mkdirSync(path.join(cwd, ".agent"), { recursive: true });
    writeFileSync(
      path.join(cwd, ".agent", ".audit-budgets.yaml"),
      ["budgets:", "  blueprint-wip-in-progress-max:", "    max: 2", ""].join("\n"),
      "utf8",
    );
    for (const slug of ["wip-1", "wip-2", "wip-3"]) {
      writeBlueprint(cwd, slug, { status: "in-progress", tasks: [{ id: "1.1", status: "todo" }] });
    }
    const result = await auditBlueprintLifecycleSql(cwd);
    expect(result.ok).toBe(false);
    expect(result.violations.some((v) => /lane limit is 2/i.test(v.message))).toBe(true);
  });

  it("warns when an in-progress blueprint is stale in git history", async () => {
    writeBlueprint(cwd, "stale-blueprint", {
      status: "in-progress",
      tasks: [{ id: "1.1", status: "todo" }],
    });

    mkdirSync(path.join(cwd, ".agent"), { recursive: true });
    writeFileSync(
      path.join(cwd, ".agent", ".audit-budgets.yaml"),
      ["budgets:", "  blueprint-stale-in-progress-days:", "    max_days: 1", ""].join("\n"),
      "utf8",
    );

    const result = await withFakeGit(
      {
        lastTouchIso: "2026-05-01T12:00:00+00:00",
        trackedFiles: ["blueprints/in-progress/stale-blueprint.md"],
      },
      () => auditBlueprintLifecycleSql(cwd),
    );
    expect(result.ok).toBe(true);
    expect(
      result.violations.some(
        (v) => v.message.startsWith("[warn]") && /stale-blueprint/.test(v.message),
      ),
      JSON.stringify(result, null, 2),
    ).toBe(true);
  });

  it("passes without a staleness warning when an in-progress blueprint is fresh in git history", async () => {
    writeBlueprint(cwd, "fresh-blueprint", {
      status: "in-progress",
      tasks: [{ id: "1.1", status: "todo" }],
    });

    mkdirSync(path.join(cwd, ".agent"), { recursive: true });
    writeFileSync(
      path.join(cwd, ".agent", ".audit-budgets.yaml"),
      ["budgets:", "  blueprint-stale-in-progress-days:", "    max_days: 14", ""].join("\n"),
      "utf8",
    );

    const result = await withFakeGit(
      {
        lastTouchIso: "2030-01-01T12:00:00+00:00",
        trackedFiles: ["blueprints/in-progress/fresh-blueprint.md"],
      },
      () => auditBlueprintLifecycleSql(cwd),
    );
    expect(result.ok).toBe(true);
    expect(result.violations.some((v) => v.message.startsWith("[warn]"))).toBe(false);
  });

  it("never applies staleness warnings to non in-progress blueprint states", async () => {
    writeBlueprint(cwd, "completed-blueprint", {
      status: "completed",
      tasks: [{ id: "1.1", status: "done" }],
    });
    writeBlueprint(cwd, "parked-blueprint", {
      status: "parked",
      tasks: [{ id: "1.1", status: "todo" }],
    });

    mkdirSync(path.join(cwd, ".agent"), { recursive: true });
    writeFileSync(
      path.join(cwd, ".agent", ".audit-budgets.yaml"),
      ["budgets:", "  blueprint-stale-in-progress-days:", "    max_days: 1", ""].join("\n"),
      "utf8",
    );

    const result = await withFakeGit(
      {
        lastTouchIso: "2026-05-01T12:00:00+00:00",
        trackedFiles: [
          "blueprints/completed/completed-blueprint.md",
          "blueprints/parked/parked-blueprint.md",
        ],
      },
      () => auditBlueprintLifecycleSql(cwd),
    );
    expect(result.ok).toBe(true);
    expect(result.violations.some((v) => /stale/i.test(v.message))).toBe(false);
  });

  it("degrades gracefully outside git by surfacing a non-failing staleness notice in the title", async () => {
    writeBlueprint(cwd, "nogit-blueprint", {
      status: "in-progress",
      tasks: [{ id: "1.1", status: "todo" }],
    });
    const result = await auditBlueprintLifecycleSql(cwd);
    expect(result.ok).toBe(true);
    expect(result.title).toContain("staleness check skipped outside git");
    expect(result.violations.some((v) => v.message.startsWith("[warn]"))).toBe(false);
  });

  it("surfaces a non-failing notice when git changed-path collection fails", async () => {
    writeBlueprint(cwd, "git-status-failed", {
      status: "in-progress",
      tasks: [{ id: "1.1", status: "todo" }],
    });

    const result = await withFakeGit(
      {
        lastTouchIso: "2030-01-01T12:00:00+00:00",
        statusError: true,
        trackedFiles: ["blueprints/in-progress/git-status-failed.md"],
      },
      () => auditBlueprintLifecycleSql(cwd),
    );
    expect(result.ok).toBe(true);
    expect(result.title).toContain("transition history check skipped");
  });

  it("flags an illegal lifecycle transition based on git history", async () => {
    writeBlueprint(cwd, "jumped-the-queue", {
      status: "in-progress",
      tasks: [{ id: "1.1", status: "todo" }],
    });
    const fromPath = "blueprints/draft/jumped-the-queue.md";
    const toPath = "blueprints/in-progress/jumped-the-queue.md";
    const result = await withFakeGit(
      {
        diffTree: fakeRenameDiff(fromPath, toPath),
        lastTouchIso: "2030-01-02T12:00:00+00:00",
        trackedFiles: [toPath],
        showBySpec: {
          [`HEAD^:${fromPath}`]: renderBlueprintMarkdown("jumped-the-queue", {
            status: "draft",
            tasks: [{ id: "1.1", status: "todo" }],
          }),
        },
      },
      () => auditBlueprintLifecycleSql(cwd),
    );
    expect(result.ok).toBe(false);
    expect(
      result.violations.some(
        (v) =>
          v.message.includes("jumped-the-queue") &&
          /illegal/i.test(v.message) &&
          /planned, completed, archived/i.test(v.message),
      ),
    ).toBe(true);
  });

  it("uses baseRef to catch illegal transitions from earlier commits in a branch range", async () => {
    writeBlueprint(cwd, "range-jump", {
      status: "in-progress",
      tasks: [{ id: "1.1", status: "todo" }],
    });
    const fromPath = "blueprints/draft/range-jump.md";
    const toPath = "blueprints/in-progress/range-jump.md";
    const result = await withFakeGit(
      {
        baseDiff: fakeRenameDiff(fromPath, toPath),
        lastTouchIso: "2030-01-02T12:00:00+00:00",
        mergeBase: "fake-base",
        trackedFiles: [toPath],
        showBySpec: {
          [`fake-base:${fromPath}`]: renderBlueprintMarkdown("range-jump", {
            status: "draft",
            tasks: [{ id: "1.1", status: "todo" }],
          }),
        },
      },
      () => auditBlueprintLifecycleSql(cwd, { baseRef: "HEAD~2" }),
    );
    expect(result.ok).toBe(false);
    expect(
      result.violations.some((v) => v.message.includes("range-jump") && /illegal/i.test(v.message)),
    ).toBe(true);
  });

  it("uses baseRef to catch delete/add lifecycle moves when rename detection fails", async () => {
    writeBlueprint(cwd, "rewrite-jump", {
      status: "in-progress",
      tasks: [{ id: "1.1", status: "todo" }],
    });
    const fromPath = "blueprints/draft/rewrite-jump.md";
    const toPath = "blueprints/in-progress/rewrite-jump.md";
    const result = await withFakeGit(
      {
        baseDiff: [`D\t${fromPath}`, `A\t${toPath}`, ""].join("\n"),
        lastTouchIso: "2030-01-02T12:00:00+00:00",
        mergeBase: "fake-base",
        trackedFiles: [toPath],
        showBySpec: {
          [`fake-base:${fromPath}`]: renderBlueprintMarkdown("rewrite-jump", {
            status: "draft",
            tasks: [{ id: "1.1", status: "todo" }],
          }),
        },
      },
      () => auditBlueprintLifecycleSql(cwd, { baseRef: "HEAD~2" }),
    );
    expect(result.ok).toBe(false);
    expect(
      result.violations.some(
        (v) => v.message.includes("rewrite-jump") && /illegal/i.test(v.message),
      ),
    ).toBe(true);
  });

  it("allows a legal lifecycle transition based on git history", async () => {
    writeBlueprint(cwd, "ready-to-start", {
      status: "in-progress",
      tasks: [{ id: "1.1", status: "todo" }],
    });
    const fromPath = "blueprints/planned/ready-to-start.md";
    const toPath = "blueprints/in-progress/ready-to-start.md";
    const result = await withFakeGit(
      {
        diffTree: fakeRenameDiff(fromPath, toPath),
        lastTouchIso: "2030-01-02T12:00:00+00:00",
        trackedFiles: [toPath],
        showBySpec: {
          [`HEAD^:${fromPath}`]: renderBlueprintMarkdown("ready-to-start", {
            status: "planned",
            tasks: [{ id: "1.1", status: "todo" }],
          }),
        },
      },
      () => auditBlueprintLifecycleSql(cwd),
    );
    expect(result.violations.some((v) => v.message.includes("ready-to-start"))).toBe(false);
  });

  it("allows planned blueprints to complete directly when all tasks are terminal", async () => {
    writeBlueprint(cwd, "one-pr-finish", {
      status: "completed",
      tasks: [
        { id: "1.1", status: "done" },
        { id: "1.2", status: "dropped" },
      ],
    });
    const fromPath = "blueprints/planned/one-pr-finish.md";
    const toPath = "blueprints/completed/one-pr-finish.md";
    const result = await withFakeGit(
      {
        diffTree: fakeRenameDiff(fromPath, toPath),
        trackedFiles: [toPath],
        showBySpec: {
          [`HEAD^:${fromPath}`]: renderBlueprintMarkdown("one-pr-finish", {
            status: "planned",
            tasks: [
              { id: "1.1", status: "done" },
              { id: "1.2", status: "dropped" },
            ],
          }),
        },
      },
      () => auditBlueprintLifecycleSql(cwd),
    );
    expect(result.ok).toBe(true);
    expect(result.violations.some((v) => v.message.includes("one-pr-finish"))).toBe(false);
  });

  it("allows draft blueprints to complete directly when all tasks are terminal", async () => {
    writeBlueprint(cwd, "draft-one-pr-finish", {
      status: "completed",
      tasks: [
        { id: "1.1", status: "done" },
        { id: "1.2", status: "dropped" },
      ],
    });
    const fromPath = "blueprints/draft/draft-one-pr-finish.md";
    const toPath = "blueprints/completed/draft-one-pr-finish.md";
    const result = await withFakeGit(
      {
        diffTree: fakeRenameDiff(fromPath, toPath),
        trackedFiles: [toPath],
        showBySpec: {
          [`HEAD^:${fromPath}`]: renderBlueprintMarkdown("draft-one-pr-finish", {
            status: "draft",
            tasks: [
              { id: "1.1", status: "done" },
              { id: "1.2", status: "dropped" },
            ],
          }),
        },
      },
      () => auditBlueprintLifecycleSql(cwd),
    );
    expect(result.ok).toBe(true);
    expect(result.violations.some((v) => v.message.includes("draft-one-pr-finish"))).toBe(false);
  });

  it("rejects direct draft-to-completed when tasks are still open", async () => {
    writeBlueprint(cwd, "draft-one-pr-open-work", {
      status: "completed",
      tasks: [{ id: "1.1", status: "todo" }],
    });
    const fromPath = "blueprints/draft/draft-one-pr-open-work.md";
    const toPath = "blueprints/completed/draft-one-pr-open-work.md";
    const result = await withFakeGit(
      {
        diffTree: fakeRenameDiff(fromPath, toPath),
        trackedFiles: [toPath],
        showBySpec: {
          [`HEAD^:${fromPath}`]: renderBlueprintMarkdown("draft-one-pr-open-work", {
            status: "draft",
            tasks: [{ id: "1.1", status: "todo" }],
          }),
        },
      },
      () => auditBlueprintLifecycleSql(cwd),
    );
    expect(result.ok).toBe(false);
    expect(
      result.violations.some(
        (v) =>
          v.message.includes("draft-one-pr-open-work") && v.message.includes("not done/dropped"),
      ),
    ).toBe(true);
  });

  it("rejects direct planned-to-completed when tasks are still open", async () => {
    writeBlueprint(cwd, "one-pr-open-work", {
      status: "completed",
      tasks: [{ id: "1.1", status: "todo" }],
    });
    const fromPath = "blueprints/planned/one-pr-open-work.md";
    const toPath = "blueprints/completed/one-pr-open-work.md";
    const result = await withFakeGit(
      {
        diffTree: fakeRenameDiff(fromPath, toPath),
        trackedFiles: [toPath],
        showBySpec: {
          [`HEAD^:${fromPath}`]: renderBlueprintMarkdown("one-pr-open-work", {
            status: "planned",
            tasks: [{ id: "1.1", status: "todo" }],
          }),
        },
      },
      () => auditBlueprintLifecycleSql(cwd),
    );
    expect(result.ok).toBe(false);
    expect(
      result.violations.some(
        (v) => v.message.includes("one-pr-open-work") && v.message.includes("not done/dropped"),
      ),
    ).toBe(true);
  });

  it("rejects direct planned-to-completed when the blueprint has zero tasks", async () => {
    writeBlueprint(cwd, "one-pr-empty", { status: "completed" });
    const fromPath = "blueprints/planned/one-pr-empty.md";
    const toPath = "blueprints/completed/one-pr-empty.md";
    const result = await withFakeGit(
      {
        diffTree: fakeRenameDiff(fromPath, toPath),
        trackedFiles: [toPath],
        showBySpec: {
          [`HEAD^:${fromPath}`]: renderBlueprintMarkdown("one-pr-empty", { status: "planned" }),
        },
      },
      () => auditBlueprintLifecycleSql(cwd),
    );
    expect(result.ok).toBe(false);
    expect(
      result.violations.some(
        (v) => v.message.includes("one-pr-empty") && /zero-task|0 tasks|no tasks/i.test(v.message),
      ),
    ).toBe(true);
  });

  it("grandfathers historical transition gaps when the current blueprint declares the existing waiver", async () => {
    writeBlueprint(cwd, "legacy-gap", {
      status: "completed",
      tasks: [{ id: "1.1", status: "todo" }],
    });
    const completedPath = path.join(cwd, "blueprints", "completed", "legacy-gap.md");
    const waivedMarkdown = readFileSync(completedPath, "utf8").replace(
      "status: completed",
      ["status: completed", "historical_verification_gap_waiver: true"].join("\n"),
    );
    writeFileSync(completedPath, waivedMarkdown, "utf8");
    const fromPath = "blueprints/draft/legacy-gap.md";
    const toPath = "blueprints/completed/legacy-gap.md";
    const result = await withFakeGit(
      {
        diffTree: fakeRenameDiff(fromPath, toPath),
        trackedFiles: [toPath],
        showBySpec: {
          [`HEAD^:${fromPath}`]: renderBlueprintMarkdown("legacy-gap", {
            status: "draft",
            tasks: [{ id: "1.1", status: "todo" }],
          }),
        },
      },
      () => auditBlueprintLifecycleSql(cwd),
    );
    expect(
      result.violations.some((v) => v.message.includes("legacy-gap") && /illegal/i.test(v.message)),
    ).toBe(false);
  });
});
