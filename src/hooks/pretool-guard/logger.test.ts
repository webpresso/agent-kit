import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import {
  formatLogLine,
  logRun,
  parseLogLine,
  readLogs,
  rotateLines,
  type LogConfig,
} from "./logger.js";

const roots: string[] = [];

afterEach(() => {
  while (roots.length > 0) rmSync(roots.pop()!, { recursive: true, force: true });
});

function config(maxLines = 250, enabled = true): LogConfig {
  const root = mkdtempSync(path.join(tmpdir(), "wp-pretool-log-"));
  roots.push(root);
  return {
    logDir: root,
    logFile: path.join(root, "pretool-guard.log"),
    enabled,
    maxLines,
  };
}

describe("pretool-guard logger", () => {
  it("formats and parses status, tool, target, failures, and error fields", () => {
    const line = formatLogLine(
      {
        status: "BLOCK",
        tool: "Write",
        target: "src/file.ts",
        failures: ["dangerous-commands", "ux-quality"],
        error: "boom",
      },
      "2026-07-01T00:00:00.000Z",
    );

    expect(parseLogLine(line)).toEqual({
      timestamp: "2026-07-01T00:00:00.000Z",
      status: "BLOCK",
      tool: "Write",
      target: "src/file.ts",
      failures: ["dangerous-commands", "ux-quality"],
      error: "boom",
    });
  });

  it("writes JSONL-style log lines to the configured temp file", () => {
    const cfg = config();

    logRun({ status: "PASS", tool: "Bash", target: "git status" }, cfg);

    expect(readLogs(cfg)).toMatchObject([{ status: "PASS", tool: "Bash", target: "git status" }]);
  });

  it("rotates to the most recent maxLines entries", () => {
    const cfg = config(2);

    logRun({ status: "PASS", tool: "Bash", target: "first" }, cfg);
    logRun({ status: "WARN", tool: "Edit", target: "second" }, cfg);
    logRun({ status: "ERROR", tool: "Write", target: "third" }, cfg);

    expect(readLogs(cfg).map((entry) => entry.target)).toEqual(["second", "third"]);
    expect(rotateLines(["a", "b", "c"], 2)).toEqual(["b", "c"]);
  });

  it("does nothing when disabled and tolerates missing or invalid log files", () => {
    const disabled = config(250, false);
    logRun({ status: "PASS", tool: "Bash", target: "ignored" }, disabled);
    expect(readLogs(disabled)).toEqual([]);

    const invalid = config();
    writeFileSync(invalid.logFile, "not a log line\n2026 invalid\n");
    expect(readLogs(invalid)).toEqual([]);
  });
});
