import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const repositoryRoot = process.cwd();

describe("CI workflow security-quality gate", () => {
  it("keeps the security-quality regression audit in the WP check dependency path", () => {
    const workflow = readFileSync(
      join(repositoryRoot, ".github", "workflows", "ci.agent-kit.yml"),
      "utf8",
    );

    expect(workflow).toContain("audits:");
    expect(workflow).toContain("Security/code-quality regression audit");
    expect(workflow).toContain("./bin/wp audit security-quality-regressions");
    expect(workflow).toContain("wp-check:");
    expect(workflow).toContain("audits,");
  });
});
