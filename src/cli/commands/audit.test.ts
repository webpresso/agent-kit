import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, test } from "vitest";

import { getAuditScopeSafety, registerAuditCommand, resolveGuardrailAuditKinds } from "./audit.js";

function buildFakeCli() {
  const options: string[] = [];
  const chain = {
    option: (name: string) => {
      options.push(name);
      return chain;
    },
    action: (_fn: unknown) => chain,
  };
  return {
    command: () => chain,
    getOptions: () => options,
  };
}

const tempDirs: string[] = [];

function makeRoot(packageName: string): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "wp-audit-guardrails-"));
  tempDirs.push(root);
  writeFileSync(path.join(root, "package.json"), JSON.stringify({ name: packageName }), "utf8");
  return root;
}

describe("resolveGuardrailAuditKinds", () => {
  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  test("does not run agent-kit MCP AI contracts against ordinary consumer repos", () => {
    const root = makeRoot("monorepo");

    expect(resolveGuardrailAuditKinds(root)).not.toContain("ai-contracts");
    expect(resolveGuardrailAuditKinds(root)).toContain("architecture-drift");
    expect(resolveGuardrailAuditKinds(root)).toContain("no-first-party-mjs");
  });

  test("keeps AI contract guardrails active for agent-kit", () => {
    const root = makeRoot("@webpresso/agent-kit");

    expect(resolveGuardrailAuditKinds(root)).toContain("ai-contracts");
    expect(resolveGuardrailAuditKinds(root)).toContain("architecture-drift");
    expect(resolveGuardrailAuditKinds(root)).toContain("no-first-party-mjs");
  });

  test("affected guardrails keep only affected-safe audits", () => {
    const root = makeRoot("@webpresso/agent-kit");

    expect(resolveGuardrailAuditKinds(root, "affected")).toContain("blueprint-lifecycle");
    expect(resolveGuardrailAuditKinds(root, "affected")).toContain("no-dev-vars");
    expect(resolveGuardrailAuditKinds(root, "affected")).not.toContain("architecture-drift");
    expect(getAuditScopeSafety("blueprint-lifecycle")).toBe("affected-safe");
    expect(getAuditScopeSafety("architecture-drift")).toBe("full-scan-only");
  });

  test("keeps AI contract guardrails active for repos that own the MCP helper surface", () => {
    const root = makeRoot("custom-agent-kit");
    const helper = path.join(root, "src/mcp/tools/_shared/result.ts");
    mkdirSync(path.dirname(helper), { recursive: true });
    writeFileSync(helper, "export {}", "utf8");

    expect(resolveGuardrailAuditKinds(root)).toContain("ai-contracts");
  });

  test("exposes the summary-first --full escape hatch", () => {
    const cli = buildFakeCli();
    registerAuditCommand(cli as never);
    expect(cli.getOptions()).toContain("--full");
  });

  test("exposes the standardized affected options and keeps changed-only as an alias", () => {
    const cli = buildFakeCli();
    registerAuditCommand(cli as never);
    expect(cli.getOptions()).toContain("--affected");
    expect(cli.getOptions()).toContain("--branch");
    expect(cli.getOptions()).toContain("--changed-only");
  });
});
