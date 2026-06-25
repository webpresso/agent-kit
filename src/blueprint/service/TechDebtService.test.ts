import { mkdirSync, writeFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import { TechDebtService } from "./TechDebtService.js";

const TECH_DEBT = `---
type: tech-debt
status: accepted
severity: medium
category: complexity
review_cadence: monthly
last_reviewed: 2026-02-01
---

# Generic Consumer Debt

Tracked in a portable consumer repo.
`;

describe("TechDebtService consumer layout", () => {
  const tempDirs: string[] = [];

  afterEach(async () => {
    for (const dir of tempDirs.splice(0)) {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("scans top-level tech-debt/ in generic webpresso consumers", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "wp-tech-debt-generic-"));
    tempDirs.push(root);
    writeFileSync(path.join(root, "package.json"), '{"name":"consumer"}');
    const itemDir = path.join(root, "tech-debt", "generic-consumer-debt");
    mkdirSync(itemDir, { recursive: true });
    writeFileSync(path.join(itemDir, "README.md"), TECH_DEBT);

    const service = new TechDebtService(root);
    await expect(service.listTechDebt()).resolves.toEqual([
      expect.objectContaining({ slug: "generic-consumer-debt", title: "Generic Consumer Debt" }),
    ]);
  });
});
