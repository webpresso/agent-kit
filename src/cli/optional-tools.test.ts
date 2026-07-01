import { describe, expect, it } from "vitest";

import {
  claimProjectOwnedTool,
  claimUserOwnedTool,
  defaultToolingOwnershipState,
} from "#cli/tooling-ownership";

import {
  OPTIONAL_TOOL_ADAPTERS,
  optionalToolCanonicalCommand,
  optionalToolUpdateSteps,
  parseOptionalToolCommandArgs,
  resolveOptionalTool,
} from "./optional-tools.js";

const VP = "/global/bin/vp";

describe("optional tool registry", () => {
  it("has a unique adapter for every managed id", () => {
    const ids = OPTIONAL_TOOL_ADAPTERS.map((adapter) => adapter.id);
    expect(ids).toHaveLength(new Set(ids).size);
    expect(ids.toSorted()).toEqual(["claude-code", "codex", "omc", "omx", "openagent", "opencode"]);
  });

  it("has unique aliases inside each namespace", () => {
    for (const namespace of ["base", "oh-my"] as const) {
      const names = OPTIONAL_TOOL_ADAPTERS.filter(
        (adapter) => adapter.namespace === namespace,
      ).flatMap((adapter) => [adapter.canonicalName, ...adapter.aliases]);
      expect(names).toHaveLength(new Set(names).size);
    }
  });

  it("resolves base and Oh My names only in their namespace", () => {
    expect(resolveOptionalTool("base", "codex")?.adapter.id).toBe("codex");
    expect(resolveOptionalTool("oh-my", "codex")?.adapter.id).toBe("omx");
    expect(resolveOptionalTool("base", "omx")).toBeNull();
    expect(resolveOptionalTool("base", "omc")).toBeNull();
    expect(resolveOptionalTool("oh-my", "opencode")?.adapter.id).toBe("openagent");
  });

  it("accepts OpenAgent aliases only inside the Oh My OpenCode namespace", () => {
    expect(resolveOptionalTool("base", "openagent")).toBeNull();
    expect(resolveOptionalTool("base", "omo")).toBeNull();
    for (const alias of ["openagent", "omo", "oh-my-openagent"] as const) {
      const resolved = resolveOptionalTool("oh-my", alias);
      expect(resolved?.adapter.id).toBe("openagent");
      expect(optionalToolCanonicalCommand(resolved!.adapter)).toBe("wp install oh-my opencode");
    }
  });

  it("rejects typoed optional-tool args with canonical examples", () => {
    expect(parseOptionalToolCommandArgs(["opencode", "garbage"])).toMatchObject({
      kind: "error",
      message: expect.stringContaining("wp install opencode"),
    });
    expect(parseOptionalToolCommandArgs(["codex", "--force"])).toMatchObject({
      kind: "error",
      message: expect.stringContaining("unsupported option --force"),
    });
    expect(parseOptionalToolCommandArgs(["oh-my", "codex", "--scope"])).toMatchObject({
      kind: "error",
      message: expect.stringContaining("--scope requires user or project"),
    });
    expect(
      parseOptionalToolCommandArgs(["oh-my", "codex", "--scope", "user", "--scope", "project"]),
    ).toMatchObject({
      kind: "error",
      message: expect.stringContaining("duplicate --scope option"),
    });
    expect(parseOptionalToolCommandArgs(["opencode", "--scope", "project"])).toMatchObject({
      kind: "error",
      message: expect.stringContaining("does not support --scope project"),
    });
  });

  it("builds non-empty update commands only for WP-owned scopes", () => {
    let state = defaultToolingOwnershipState();
    state = claimUserOwnedTool(state, "codex");
    state = claimUserOwnedTool(state, "omx");
    state = claimProjectOwnedTool(state, "omx", "repo-123");
    state = claimUserOwnedTool(state, "omc");
    state = claimProjectOwnedTool(state, "omc", "repo-123");
    state = claimProjectOwnedTool(state, "omc", "repo-other");

    const steps = optionalToolUpdateSteps({
      ownershipState: state,
      repoKey: "repo-123",
      vpCommand: VP,
      cwd: "/repo/current",
    });

    expect(steps.map((step) => step.id)).toEqual(["codex", "omx", "omc", "omc-project"]);
    expect(steps.every((step) => step.command.length > 0)).toBe(true);
    expect(steps.every((step) => step.optional === true)).toBe(true);
    expect(steps.find((step) => step.id === "omx")?.args).toEqual(["update", "-g", "oh-my-codex"]);
    expect(steps.filter((step) => step.id === "omx")).toHaveLength(1);
    expect(steps.find((step) => step.id === "omc-project")?.cwd).toBe("/repo/current");
  });

  it("refreshes Oh My OpenAgent via vp dlx instead of a global package update", () => {
    const state = claimUserOwnedTool(defaultToolingOwnershipState(), "openagent");
    const steps = optionalToolUpdateSteps({
      ownershipState: state,
      repoKey: "repo-123",
      vpCommand: VP,
      cwd: "/repo/current",
    });

    expect(steps).toHaveLength(1);
    expect(steps[0]).toMatchObject({ id: "openagent", command: VP });
    expect(steps[0]?.args.slice(0, 3)).toEqual(["dlx", "oh-my-openagent@latest", "install"]);
    expect(steps[0]?.args).toContain("--platform=opencode");
  });

  it("ignores project ownership from other repos", () => {
    const state = claimProjectOwnedTool(defaultToolingOwnershipState(), "omc", "repo-other");
    expect(
      optionalToolUpdateSteps({
        ownershipState: state,
        repoKey: "repo-123",
        vpCommand: VP,
        cwd: "/repo/current",
      }),
    ).toEqual([]);
  });
});
