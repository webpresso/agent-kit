import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { executeTechDebtSubcommand } from "./router-dispatch.js";

describe("tech-debt from weakness-mining audit", () => {
  let root: string;
  let logs: string[];

  beforeEach(() => {
    root = join(
      tmpdir(),
      `wp-tech-debt-weakness-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(join(root, ".agent", "logs"), { recursive: true });
    writeFileSync(
      join(root, ".agent", "logs", "pretool-guard.log"),
      [
        '2026-06-13T10:00:00.000Z BLOCK Bash target="rm -rf /" failures=[dangerous-command]',
        '2026-06-13T10:00:01.000Z BLOCK Bash target="rm -rf /" failures=[dangerous-command]',
      ].join("\n") + "\n",
    );
    logs = [];
    vi.spyOn(console, "log").mockImplementation((message?: unknown) => {
      logs.push(String(message));
    });
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await import("node:fs/promises").then((fs) => fs.rm(root, { recursive: true, force: true }));
  });

  it("routes weakness-mining as a supported from-audit source", async () => {
    await executeTechDebtSubcommand("new", ["ignored"], {
      cwd: root,
      fromAudit: "weakness-mining",
      dryRun: true,
    });

    const today = new Date().toISOString().slice(0, 10);
    expect(logs).toEqual([
      `Would create: ${join(
        root,
        "webpresso",
        "tech-debt",
        "needs-remediation",
        `h-001-audit-weakness-mining-findings-${today}.md`,
      )}`,
    ]);
  });
});
