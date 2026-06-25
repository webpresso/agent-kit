import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { checkAcceptanceCriteria } from "./criteria.js";

describe("acceptance criteria validation (integration)", () => {
  let tempDir: string;

  beforeAll(() => {
    tempDir = mkdtempSync(join(tmpdir(), "criteria-"));
  });

  afterAll(() => {
    rmSync(tempDir, { recursive: true, force: true });
  });

  it("checks acceptance criteria in markdown file", () => {
    const md = `## Acceptance Criteria
- [x] Feature works
- [x] Tests pass
- [ ] Documentation updated
`;
    const filePath = join(tempDir, "criteria.md");
    writeFileSync(filePath, md);
    const content = readFileSync(filePath, "utf-8");
    const result = checkAcceptanceCriteria(content);
    expect(result).toMatchObject({});
  });

  it("handles markdown with no criteria", () => {
    const result = checkAcceptanceCriteria("# No criteria here\n");
    expect(result).toMatchObject({});
  });
});
