import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();

describe("CI workflow PR description model disclosure contract", () => {
  it("keeps model disclosure required by the WP check dependency path", () => {
    const workflow = readFileSync(
      join(repositoryRoot, ".github", "workflows", "ci.agent-kit.yml"),
      "utf8",
    );

    expect(workflow).toContain("pr-description-contract:");
    expect(workflow).toContain("PR description contract");
    expect(workflow).toContain('jq -r \'.pull_request.body // ""\' "$GITHUB_EVENT_PATH"');
    expect(workflow).toContain('require_field "Execution model(s)"');
    expect(workflow).toContain('require_field "Planning/refinement model(s)"');
    expect(workflow).toContain('require_field "Review/verification model(s)"');
    expect(workflow).toContain("wp-check:");
    expect(workflow).toContain("pr-description-contract,");
  });

  it("ships a PR template with the enforced model disclosure fields", () => {
    const template = readFileSync(
      join(repositoryRoot, ".github", "PULL_REQUEST_TEMPLATE.md"),
      "utf8",
    );

    expect(template).toContain("## AI/model disclosure");
    expect(template).toContain("- Execution model(s):");
    expect(template).toContain("- Planning/refinement model(s):");
    expect(template).toContain("- Review/verification model(s):");
  });
});
