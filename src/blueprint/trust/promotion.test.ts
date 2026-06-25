import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { applyPromotionTrustGate, parseAllowedWpCommand } from "./promotion.js";
import { VALID_DOSSIER } from "./test-fixtures.js";

describe("parseAllowedWpCommand", () => {
  it("accepts wp facade commands and rejects shell syntax", () => {
    expect(parseAllowedWpCommand("wp audit blueprint-lifecycle")).toEqual([
      "wp",
      "audit",
      "blueprint-lifecycle",
    ]);
    expect(parseAllowedWpCommand("wp format --check")).toEqual(["wp", "format", "--check"]);
    expect(parseAllowedWpCommand("wp audit guardrails --affected --branch")).toEqual([
      "wp",
      "audit",
      "guardrails",
      "--affected",
      "--branch",
    ]);
    expect(() => parseAllowedWpCommand("wp audit x && rm -rf .")).toThrow(/Rejected/);
    expect(() => parseAllowedWpCommand("node script.js")).toThrow(/wp facade/);
    expect(() => parseAllowedWpCommand("wp audit x --fix")).toThrow(/Rejected/);
  });
});

describe("applyPromotionTrustGate", () => {
  const previousHead = process.env["WP_BLUEPRINT_TRUST_GATE_TEST_HEAD"];
  afterEach(() => {
    if (previousHead === undefined) delete process.env["WP_BLUEPRINT_TRUST_GATE_TEST_HEAD"];
    else process.env["WP_BLUEPRINT_TRUST_GATE_TEST_HEAD"] = previousHead;
  });

  it("overwrites service-owned readiness placeholders before validation", () => {
    process.env["WP_BLUEPRINT_TRUST_GATE_TEST_HEAD"] = "0123456789abcdef0123456789abcdef01234567";
    const root = mkdtempSync(path.join(tmpdir(), "promotion-placeholders-"));
    try {
      mkdirSync(path.join(root, "bin"), { recursive: true });
      writeFileSync(path.join(root, "README.md"), "# ok\n");
      writeFileSync(path.join(root, "bin", "wp"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
      const markdown = VALID_DOSSIER.replace(
        "- verified-at: 2026-06-22T00:00:00.000Z",
        "- verified-at: <ISO-8601 timestamp>",
      )
        .replace(
          "- verified-head: 0123456789abcdef0123456789abcdef01234567",
          "- verified-head: <full git commit SHA>",
        )
        .replace("wp audit blueprint-lifecycle", "wp lint");
      const promoted = applyPromotionTrustGate({
        repoRoot: root,
        file: "README.md",
        markdown,
        now: new Date("2026-06-22T00:00:00.000Z"),
      });
      expect(promoted).toContain("- verified-at: 2026-06-22T00:00:00.000Z");
      expect(promoted).toContain("- verified-head: 0123456789abcdef0123456789abcdef01234567");
      expect(promoted).toContain("pass at 2026-06-22T00:00:00.000Z");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("inserts missing service-owned readiness stamps before validation", () => {
    process.env["WP_BLUEPRINT_TRUST_GATE_TEST_HEAD"] = "0123456789abcdef0123456789abcdef01234567";
    const root = mkdtempSync(path.join(tmpdir(), "promotion-upsert-"));
    try {
      mkdirSync(path.join(root, "bin"), { recursive: true });
      writeFileSync(path.join(root, "README.md"), "# ok\n");
      writeFileSync(path.join(root, "bin", "wp"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
      const markdown = VALID_DOSSIER.replace("- verified-at: 2026-06-22T00:00:00.000Z\n", "")
        .replace("- verified-head: 0123456789abcdef0123456789abcdef01234567\n", "")
        .replace("wp audit blueprint-lifecycle", "wp lint");
      const promoted = applyPromotionTrustGate({
        repoRoot: root,
        file: "README.md",
        markdown,
        now: new Date("2026-06-22T00:00:00.000Z"),
      });
      expect(promoted).toContain("- verified-at: 2026-06-22T00:00:00.000Z");
      expect(promoted).toContain("- verified-head: 0123456789abcdef0123456789abcdef01234567");
      expect(promoted).toContain("pass at 2026-06-22T00:00:00.000Z");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("validates readiness before executing declared promotion commands", () => {
    process.env["WP_BLUEPRINT_TRUST_GATE_TEST_HEAD"] = "0123456789abcdef0123456789abcdef01234567";
    const invalid = VALID_DOSSIER.replace(
      "- promotion-ready: true",
      "- promotion-ready: false",
    ).replace("wp audit blueprint-lifecycle", "node should-not-run.js");
    expect(() =>
      applyPromotionTrustGate({
        repoRoot: process.cwd(),
        file: "README.md",
        markdown: invalid,
        now: new Date("2026-06-22T00:00:00.000Z"),
      }),
    ).toThrow(/promotion-ready must be true/);
  });
});
