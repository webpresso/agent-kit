import { describe, expect, it } from "vitest";

import {
  blueprintDerivedHandoffSchema,
  blueprintExecutionPolicySchema,
  blueprintExecutionSpecSchema,
  blueprintLaunchSpecSchema,
  blueprintTaskLaunchSpecSchema,
  DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT,
  runtimeStateSnapshotSchema,
} from "./types.js";

describe("blueprintTaskLaunchSpecSchema", () => {
  it("defaults optional task arrays and backend hints", () => {
    const result = blueprintTaskLaunchSpecSchema.parse({
      id: "1.1",
      title: "Compile launch spec",
    });

    expect(result.dependsOn).toEqual([]);
    expect(result.files).toEqual([]);
    expect(result.verificationCommands).toEqual([]);
    expect(result.backendHints).toEqual({});
  });
});

describe("blueprintExecutionPolicySchema", () => {
  it("defaults runtime state to .omx/state", () => {
    const result = blueprintExecutionPolicySchema.parse({});

    expect(result.runtimeStateRoot).toBe(DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT);
    expect(result.preferWorktree).toBe(false);
    expect(result.requireVerificationForCompletion).toBe(true);
  });

  it("rejects runtime state roots outside .omx/state", () => {
    expect(() =>
      blueprintExecutionPolicySchema.parse({
        runtimeStateRoot: ".omx/plans",
      }),
    ).toThrow(/runtimeStateRoot must stay under \.omx\/state/);
  });

  it("accepts a bare .omx/state as the runtime root", () => {
    const result = blueprintExecutionPolicySchema.parse({
      runtimeStateRoot: ".omx/state",
    });

    expect(result.runtimeStateRoot).toBe(".omx/state");
  });

  it("accepts subdirectories under .omx/state", () => {
    const result = blueprintExecutionPolicySchema.parse({
      runtimeStateRoot: ".omx/state/custom",
    });

    expect(result.runtimeStateRoot).toBe(".omx/state/custom");
  });

  it("rejects paths that are prefixed with .omx/state but not actually under it", () => {
    expect(() =>
      blueprintExecutionPolicySchema.parse({
        runtimeStateRoot: ".omx/statecraft",
      }),
    ).toThrow(/runtimeStateRoot must stay under \.omx\/state/);
  });
});

describe("blueprintLaunchSpecSchema", () => {
  it("accepts a legacy Webpresso blueprint-backed launch spec", () => {
    const result = blueprintLaunchSpecSchema.parse({
      backend: "omx-team",
      blueprintPath: "webpresso/blueprints/in-progress/test-plan/_overview.md",
      blueprintSlug: "in-progress/test-plan",
      mode: "durable",
      policy: {},
      tasks: [
        {
          id: "1.1",
          title: "Do work",
          verificationCommands: ["just test --file some.test.ts"],
        },
      ],
    });

    expect(result.backend).toBe("omx-team");
    expect(result.policy.runtimeStateRoot).toBe(DEFAULT_BLUEPRINT_RUNTIME_STATE_ROOT);
  });

  it("accepts a generic consumer blueprint-backed launch spec", () => {
    const result = blueprintLaunchSpecSchema.parse({
      backend: "omx-team",
      blueprintPath: "blueprints/in-progress/test-plan/_overview.md",
      blueprintSlug: "in-progress/test-plan",
      mode: "durable",
      policy: {},
      tasks: [],
    });

    expect(result.blueprintPath).toBe("blueprints/in-progress/test-plan/_overview.md");
  });

  it("rejects launch specs rooted in .omx/plans", () => {
    expect(() =>
      blueprintLaunchSpecSchema.parse({
        backend: "omx-team",
        blueprintPath: ".omx/plans/prd-test.md",
        blueprintSlug: "prd-test",
        mode: "durable",
        policy: {},
        tasks: [],
      }),
    ).toThrow(/blueprintPath must point at blueprints\/ or webpresso\/blueprints/);
  });

  it("rejects blueprint paths not in blueprints directories", () => {
    expect(() =>
      blueprintLaunchSpecSchema.parse({
        backend: "omx-team",
        blueprintPath: "src/some-code.ts",
        blueprintSlug: "prd-test",
        mode: "durable",
        policy: {},
        tasks: [],
      }),
    ).toThrow(/blueprintPath must point at blueprints\/ or webpresso\/blueprints/);
  });

  it("accepts blueprint paths starting with blueprints/", () => {
    const result = blueprintLaunchSpecSchema.parse({
      backend: "omx-team",
      blueprintPath: "blueprints/some-path/_overview.md",
      blueprintSlug: "in-progress/some-path",
      mode: "durable",
      policy: {},
      tasks: [],
    });

    expect(result.blueprintPath).toBe("blueprints/some-path/_overview.md");
  });

  it("rejects blueprint paths ending strangely", () => {
    expect(() =>
      blueprintLaunchSpecSchema.parse({
        backend: "omx-team",
        blueprintPath: "src/blueprints-fake/test.md",
        blueprintSlug: "test",
        mode: "durable",
        policy: {},
        tasks: [],
      }),
    ).toThrow(/blueprintPath must point at blueprints\/ or webpresso\/blueprints/);
  });

  it("accepts paths containing blueprints/ in a nested path", () => {
    const result = blueprintLaunchSpecSchema.parse({
      backend: "omx-team",
      blueprintPath: "src/blueprints/in-progress/test-plan/_overview.md",
      blueprintSlug: "in-progress/test-plan",
      mode: "durable",
      policy: {},
      tasks: [],
    });

    expect(result.blueprintPath).toBe("src/blueprints/in-progress/test-plan/_overview.md");
  });
});

describe("blueprintExecutionSpecSchema", () => {
  it("aliases the shipped launch-spec contract", () => {
    const result = blueprintExecutionSpecSchema.parse({
      backend: "omx-team",
      blueprintPath: "webpresso/blueprints/in-progress/test-plan/_overview.md",
      blueprintSlug: "in-progress/test-plan",
      mode: "durable",
      policy: {},
      tasks: [],
    });

    expect(result.blueprintSlug).toBe("in-progress/test-plan");
  });
});

describe("blueprintDerivedHandoffSchema", () => {
  it("accepts derived handoff frontmatter with optional Codex and OMX provenance links", () => {
    const result = blueprintDerivedHandoffSchema.parse({
      blueprint_path: "blueprints/in-progress/test-plan/_overview.md",
      blueprint_slug: "in-progress/test-plan",
      codex_goal: {
        objective_hash: "sha256:goal-abc",
        status_at_handoff: "active",
        thread_id: "019e6da9-9002-7b63-a261-88b5844453a0",
      },
      content_hash: "abc123",
      derived: true,
      generated_at: "2026-05-28T10:00:00Z",
      generated_by: "wp blueprint handoff",
      head_at_ingest: null,
      "non-authoritative": true,
      omx_context: {
        execution_id: "team-123",
        goal_id: "G002",
        ledger_path: ".omx/ultragoal/ledger.jsonl",
        mode: "team",
        plan_path: ".omx/ultragoal/goals.json",
        session_id: "omx-1779961577929-bg63ul",
        state_paths: [".omx/state/team/team-123", ".omx/state/native-stop-state.json"],
      },
    });

    expect(result.blueprint_slug).toBe("in-progress/test-plan");
    expect(result.codex_goal?.thread_id).toBe("019e6da9-9002-7b63-a261-88b5844453a0");
    expect(result.omx_context?.ledger_path).toBe(".omx/ultragoal/ledger.jsonl");
  });

  it("rejects handoffs that point back into .omx/plans", () => {
    expect(() =>
      blueprintDerivedHandoffSchema.parse({
        blueprint_path: ".omx/plans/prd-test.md",
        blueprint_slug: "prd-test",
        content_hash: "abc123",
        derived: true,
        head_at_ingest: "deadbeef",
        "non-authoritative": true,
      }),
    ).toThrow(/blueprint_path must point at blueprints\/ or webpresso\/blueprints/);
  });

  it("rejects invalid optional provenance shapes", () => {
    const result = blueprintDerivedHandoffSchema.safeParse({
      blueprint_path: "blueprints/in-progress/test-plan/_overview.md",
      blueprint_slug: "in-progress/test-plan",
      codex_goal: {
        thread_id: 123,
      },
      content_hash: "abc123",
      derived: true,
      head_at_ingest: "deadbeef",
      "non-authoritative": true,
    });

    expect(result.success).toBe(false);
    if (result.success) {
      throw new Error("Expected parse failure for invalid optional provenance");
    }
    expect(result.error.issues).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: ["codex_goal", "thread_id"],
        }),
      ]),
    );
  });
});

describe("runtimeStateSnapshotSchema", () => {
  it("requires runtime identity and status", () => {
    const result = runtimeStateSnapshotSchema.parse({
      backend: "omx-team",
      executionId: "job-123",
      status: "running",
      updatedAt: "2026-04-10T10:00:00Z",
    });

    expect(result.executionId).toBe("job-123");
    expect(result.status).toBe("running");
  });
});
