import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();

describe("CI workflow Version Packages gating", () => {
  it("skips blueprint-gate for changeset release PR branches", () => {
    const workflow = readFileSync(
      join(repositoryRoot, ".github", "workflows", "ci.agent-kit.yml"),
      "utf8",
    );

    expect(workflow).toContain("blueprint-gate:");
    expect(workflow).toContain(
      "github.event_name == 'pull_request' && !startsWith(github.head_ref, 'changeset-release/')",
    );
  });

  it("runs changed blueprint lifecycle validation inside the required Blueprint gate", () => {
    const workflow = readFileSync(
      join(repositoryRoot, ".github", "workflows", "ci.agent-kit.yml"),
      "utf8",
    );

    const blueprintGateStart = workflow.indexOf("  blueprint-gate:");
    expect(blueprintGateStart).toBeGreaterThanOrEqual(0);
    const rest = workflow.slice(blueprintGateStart + 1);
    const nextJob = /\n  [a-z0-9-]+:\n/u.exec(rest);
    const blueprintGate = nextJob ? rest.slice(0, nextJob.index) : rest;

    expect(blueprintGate).toContain("Require blueprint coverage for non-doc PRs");
    expect(blueprintGate).toContain(
      'run: ./bin/wp audit blueprint-pr-coverage --base "${{ github.event.pull_request.base.sha }}"',
    );
    expect(blueprintGate).toContain("Validate changed blueprint lifecycle");
    expect(blueprintGate).toContain(
      'run: ./bin/wp audit blueprint-lifecycle --affected --base "${{ github.event.pull_request.base.sha }}"',
    );
    expect(blueprintGate.indexOf("blueprint-pr-coverage")).toBeLessThan(
      blueprintGate.indexOf("blueprint-lifecycle --affected"),
    );
  });
});
