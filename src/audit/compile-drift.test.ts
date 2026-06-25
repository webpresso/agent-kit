import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { hashAgentDir } from "#cli/commands/compile";
import { auditCompileDrift } from "./compile-drift.js";

function makeManifest(sourceHash: string): string {
  return JSON.stringify({
    version: 1,
    timestamp: new Date().toISOString(),
    sourceHash,
    outputHashes: {},
  });
}

describe("auditCompileDrift", () => {
  let dirs: string[] = [];

  beforeEach(() => {
    dirs = [];
  });
  afterEach(() => {
    for (const d of dirs) rmSync(d, { recursive: true, force: true });
  });

  function tmp(): string {
    const d = mkdtempSync(join(tmpdir(), "wp-compile-drift-audit-"));
    dirs.push(d);
    return d;
  }

  function writeSkill(agentDir: string, name: string, content: string): void {
    mkdirSync(join(agentDir, "skills", name), { recursive: true });
    writeFileSync(join(agentDir, "skills", name, "SKILL.md"), content);
  }

  it("passes with no violations when no manifest exists", async () => {
    const cwd = tmp();
    mkdirSync(join(cwd, ".agent"), { recursive: true });

    const result = await auditCompileDrift(cwd);

    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.checked).toBe(0);
  });

  it("passes when manifest sourceHash matches current .agent/ hash", async () => {
    const cwd = tmp();
    const agentDir = join(cwd, ".agent");
    mkdirSync(agentDir, { recursive: true });
    writeSkill(agentDir, "debug", "---\nname: debug\ndescription: Debugging\n---\n");

    const currentHash = hashAgentDir(agentDir);
    writeFileSync(join(agentDir, ".compile-manifest.json"), makeManifest(currentHash));

    const result = await auditCompileDrift(cwd);

    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
    expect(result.checked).toBe(1);
  });

  it("fails when manifest sourceHash differs from current .agent/ hash", async () => {
    const cwd = tmp();
    const agentDir = join(cwd, ".agent");
    mkdirSync(agentDir, { recursive: true });
    writeSkill(agentDir, "debug", "---\nname: debug\ndescription: v1\n---\n");

    const staleHash = hashAgentDir(agentDir);
    // Mutate source AFTER capturing the hash
    writeSkill(agentDir, "debug", "---\nname: debug\ndescription: v2 changed\n---\n");
    writeFileSync(join(agentDir, ".compile-manifest.json"), makeManifest(staleHash));

    const result = await auditCompileDrift(cwd);

    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
    expect(result.violations[0]?.message).toContain("Compile drift detected");
    expect(result.violations[0]?.message).toContain("wp compile");
  });

  it("violation file is .agent/.compile-manifest.json", async () => {
    const cwd = tmp();
    const agentDir = join(cwd, ".agent");
    mkdirSync(agentDir, { recursive: true });
    writeSkill(agentDir, "debug", "v1");
    const staleHash = hashAgentDir(agentDir);
    writeSkill(agentDir, "debug", "v2");
    writeFileSync(join(agentDir, ".compile-manifest.json"), makeManifest(staleHash));

    const result = await auditCompileDrift(cwd);

    expect(result.violations[0]?.file).toBe(".agent/.compile-manifest.json");
  });

  it('title is "compile drift"', async () => {
    const cwd = tmp();
    mkdirSync(join(cwd, ".agent"), { recursive: true });

    const result = await auditCompileDrift(cwd);

    expect(result.title).toBe("compile drift");
  });

  it("passes after adding a new skill (fresh recompile scenario)", async () => {
    const cwd = tmp();
    const agentDir = join(cwd, ".agent");
    mkdirSync(agentDir, { recursive: true });
    writeSkill(agentDir, "review", "---\nname: review\ndescription: Code review\n---\n");

    const hash = hashAgentDir(agentDir);
    writeFileSync(join(agentDir, ".compile-manifest.json"), makeManifest(hash));

    const result = await auditCompileDrift(cwd);

    expect(result.ok).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it("detects drift after adding a new skill without recompiling", async () => {
    const cwd = tmp();
    const agentDir = join(cwd, ".agent");
    mkdirSync(agentDir, { recursive: true });
    writeSkill(agentDir, "review", "---\nname: review\ndescription: Code review\n---\n");

    const staleHash = hashAgentDir(agentDir);
    writeFileSync(join(agentDir, ".compile-manifest.json"), makeManifest(staleHash));

    // Add another skill without recompiling
    writeSkill(agentDir, "debug", "---\nname: debug\ndescription: Debugging\n---\n");

    const result = await auditCompileDrift(cwd);

    expect(result.ok).toBe(false);
    expect(result.violations).toHaveLength(1);
  });
});
