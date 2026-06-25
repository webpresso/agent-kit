/**
 * Tests for the `wp_audit` MCP tool.
 *
 * Mocks the underlying audit library functions and the `node:child_process`
 * `spawn` (used for the tph kind which runs as a Bun script). Asserts each
 * `kind` dispatches correctly, that successful audits return
 * `{passed: true, ...}`, and that failures (thrown OR ok=false) return
 * `{passed: false, ...}` without crashing the handler.
 */

import { describe, expect, it, vi, beforeEach } from "vitest";

const tphRunnerMock = {
  runTphAudit: vi.fn(),
};
const tphE2eRunnerMock = {
  runTphE2eAudit: vi.fn(),
};

const repoGuardrailsMock = {
  auditCatalogDrift: vi.fn(),
  auditCommitMessageFile: vi.fn(),
  auditDocsFrontmatter: vi.fn(),
  auditBlueprintLifecycle: vi.fn(),
  formatRepoAuditReport: vi.fn(() => "formatted report"),
};

const blueprintLifecycleSqlMock = {
  auditBlueprintLifecycleSql: vi.fn(),
};

const blueprintReadmeDriftMock = {
  auditBlueprintReadmeDrift: vi.fn(),
};

const blueprintPrCoverageMock = {
  auditBlueprintPrCoverage: vi.fn(),
};

const githubActionsSecretsMock = {
  auditGithubActionsSecrets: vi.fn(),
};

const agentsAuditMock = {
  auditAgents: vi.fn(),
};

const referenceParityMatrixMock = {
  auditReferenceParityMatrix: vi.fn(),
};

const techDebtMock = {
  auditTechDebt: vi.fn(),
};

const aiContractsMock = {
  auditAiContracts: vi.fn(),
};

const architectureDriftMock = {
  auditArchitectureDrift: vi.fn(),
};

const cloudflareDeployContractMock = {
  auditCloudflareDeployContract: vi.fn(),
};

const absolutePathPolicyMock = {
  auditAbsolutePathPolicy: vi.fn(),
};

const noFirstPartyMjsMock = {
  auditNoFirstPartyMjs: vi.fn(),
};

const toolchainIsolationMock = {
  auditToolchainIsolation: vi.fn(),
};

const openSourceLicensesMock = {
  auditOpenSourceLicenses: vi.fn(),
};

const harnessSurfacesMock = {
  auditHarnessSurfaces: vi.fn(),
};

const weaknessMiningMock = {
  auditWeaknessMining: vi.fn(),
};

const harnessOverlayEvidenceMock = {
  auditHarnessOverlayEvidence: vi.fn(),
};

const viteLocalMock = {
  runBundleBudgetCli: vi.fn(),
};

vi.mock("#audit/repo-guardrails", () => repoGuardrailsMock);
vi.mock("#audit/blueprint-readme-drift", () => blueprintReadmeDriftMock);
vi.mock("#audit/blueprint-pr-coverage", () => blueprintPrCoverageMock);
vi.mock("#audit/github-actions-secrets", () => githubActionsSecretsMock);
vi.mock("#audit/blueprint-lifecycle-sql", () => blueprintLifecycleSqlMock);
vi.mock("#audit/agents", () => agentsAuditMock);
vi.mock("#audit/reference-parity-matrix", () => referenceParityMatrixMock);
vi.mock("#audit/tech-debt", () => techDebtMock);
vi.mock("#audit/ai-contracts", () => aiContractsMock);
vi.mock("#audit/architecture-drift", () => architectureDriftMock);
vi.mock("#audit/cloudflare-deploy-contract", () => cloudflareDeployContractMock);
vi.mock("#audit/absolute-path-policy", () => absolutePathPolicyMock);
vi.mock("#audit/no-first-party-mjs", () => noFirstPartyMjsMock);
vi.mock("#audit/toolchain-isolation", () => toolchainIsolationMock);
vi.mock("#audit/open-source-licenses", () => openSourceLicensesMock);
vi.mock("#audit/harness-surfaces", () => harnessSurfacesMock);
vi.mock("#audit/weakness-mining/index", () => weaknessMiningMock);
vi.mock("#audit/harness-overlay-evidence", () => harnessOverlayEvidenceMock);
vi.mock("../../vite/local.js", () => viteLocalMock);
vi.mock("#audit/audit-tph-runner", () => tphRunnerMock);
vi.mock("#audit/audit-tph-e2e-runner", () => tphE2eRunnerMock);

import akAuditTool from "./audit.js";

function passingAudit() {
  return { ok: true, title: "t", checked: 1, violations: [] };
}

function failingAudit() {
  return { ok: false, title: "t", checked: 1, violations: [{ message: "boom" }] };
}

function parsePayload(result: {
  structuredContent?: unknown;
  content: ReadonlyArray<{ type: string; text?: string }>;
}) {
  return result.structuredContent as {
    passed: boolean;
    summary: string;
    kind: string;
    details: unknown;
    rawOutput?: string;
    truncated?: boolean;
  };
}

beforeEach(() => {
  for (const fn of Object.values(repoGuardrailsMock)) {
    if (typeof fn === "function" && "mockReset" in fn)
      (fn as { mockReset: () => void }).mockReset();
  }
  agentsAuditMock.auditAgents.mockReset();
  referenceParityMatrixMock.auditReferenceParityMatrix.mockReset();
  techDebtMock.auditTechDebt.mockReset();
  aiContractsMock.auditAiContracts.mockReset();
  architectureDriftMock.auditArchitectureDrift.mockReset();
  cloudflareDeployContractMock.auditCloudflareDeployContract.mockReset();
  absolutePathPolicyMock.auditAbsolutePathPolicy.mockReset();
  noFirstPartyMjsMock.auditNoFirstPartyMjs.mockReset();
  blueprintReadmeDriftMock.auditBlueprintReadmeDrift.mockReset();
  blueprintPrCoverageMock.auditBlueprintPrCoverage.mockReset();
  blueprintLifecycleSqlMock.auditBlueprintLifecycleSql.mockReset();
  toolchainIsolationMock.auditToolchainIsolation.mockReset();
  openSourceLicensesMock.auditOpenSourceLicenses.mockReset();
  harnessSurfacesMock.auditHarnessSurfaces.mockReset();
  weaknessMiningMock.auditWeaknessMining.mockReset();
  harnessOverlayEvidenceMock.auditHarnessOverlayEvidence.mockReset();
  viteLocalMock.runBundleBudgetCli.mockReset();
  tphRunnerMock.runTphAudit.mockReset();
  tphE2eRunnerMock.runTphE2eAudit.mockReset();
  repoGuardrailsMock.formatRepoAuditReport.mockReturnValue("formatted report");
});

describe("wp_audit tool", () => {
  it("exposes the expected descriptor surface", () => {
    expect(akAuditTool.name).toBe("wp_audit");
    expect(typeof akAuditTool.description).toBe("string");
    expect(akAuditTool.handler).toBeTypeOf("function");
  });

  describe("dispatch by kind (passing audits)", () => {
    it("catalog-drift -> auditCatalogDrift", async () => {
      repoGuardrailsMock.auditCatalogDrift.mockReturnValue(passingAudit());
      const result = await akAuditTool.handler({ kind: "catalog-drift" });
      expect(repoGuardrailsMock.auditCatalogDrift).toHaveBeenCalledTimes(1);
      const payload = parsePayload(result);
      expect(payload.passed).toBe(true);
      expect(payload.summary).toBe("catalog-drift audit passed (1 checked)");
      expect(payload.kind).toBe("catalog-drift");
      expect((result.content[0] as { text: string }).text).toBe(
        "catalog-drift audit passed (1 checked)",
      );
    });

    it("docs-frontmatter -> auditDocsFrontmatter", async () => {
      repoGuardrailsMock.auditDocsFrontmatter.mockReturnValue(passingAudit());
      const result = await akAuditTool.handler({ kind: "docs-frontmatter" });
      expect(repoGuardrailsMock.auditDocsFrontmatter).toHaveBeenCalledTimes(1);
      expect(parsePayload(result).passed).toBe(true);
    });

    it("blueprint-readme-drift -> auditBlueprintReadmeDrift", async () => {
      blueprintReadmeDriftMock.auditBlueprintReadmeDrift.mockReturnValue(passingAudit());
      const result = await akAuditTool.handler({ kind: "blueprint-readme-drift" });
      expect(blueprintReadmeDriftMock.auditBlueprintReadmeDrift).toHaveBeenCalledTimes(1);
      expect(parsePayload(result).passed).toBe(true);
    });

    it("blueprint-pr-coverage -> auditBlueprintPrCoverage with baseRef", async () => {
      blueprintPrCoverageMock.auditBlueprintPrCoverage.mockReturnValue(passingAudit());
      const result = await akAuditTool.handler({
        kind: "blueprint-pr-coverage",
        cwd: "/repo",
        baseRef: "abc123",
      });
      expect(blueprintPrCoverageMock.auditBlueprintPrCoverage).toHaveBeenCalledWith("/repo", {
        baseRef: "abc123",
      });
      expect(parsePayload(result).passed).toBe(true);
    });

    it("github-actions-secrets -> auditGithubActionsSecrets", async () => {
      githubActionsSecretsMock.auditGithubActionsSecrets.mockReturnValue(passingAudit());
      const result = await akAuditTool.handler({ kind: "github-actions-secrets", cwd: "/repo" });
      expect(githubActionsSecretsMock.auditGithubActionsSecrets).toHaveBeenCalledWith("/repo");
      expect(parsePayload(result).passed).toBe(true);
      expect(parsePayload(result).kind).toBe("github-actions-secrets");
    });

    it("agents -> auditAgents", async () => {
      agentsAuditMock.auditAgents.mockReturnValue(passingAudit());
      const result = await akAuditTool.handler({ kind: "agents" });
      expect(agentsAuditMock.auditAgents).toHaveBeenCalledTimes(1);
      const payload = parsePayload(result);
      expect(payload.passed).toBe(true);
      expect(payload.kind).toBe("agents");
    });

    it("reference-parity-matrix -> auditReferenceParityMatrix", async () => {
      referenceParityMatrixMock.auditReferenceParityMatrix.mockReturnValue(passingAudit());
      const result = await akAuditTool.handler({ kind: "reference-parity-matrix" });
      expect(referenceParityMatrixMock.auditReferenceParityMatrix).toHaveBeenCalledWith(
        process.cwd(),
        undefined,
        { requireReleaseReady: undefined },
      );
      const payload = parsePayload(result);
      expect(payload.passed).toBe(true);
      expect(payload.kind).toBe("reference-parity-matrix");
    });

    it("passes strict through to reference parity release readiness", async () => {
      referenceParityMatrixMock.auditReferenceParityMatrix.mockReturnValue(passingAudit());
      await akAuditTool.handler({
        kind: "reference-parity-matrix",
        cwd: "/repo",
        strict: true,
      });
      expect(referenceParityMatrixMock.auditReferenceParityMatrix).toHaveBeenCalledWith(
        "/repo",
        undefined,
        { requireReleaseReady: true },
      );
    });

    it("blueprint-lifecycle -> auditBlueprintLifecycleSql (ephemeral projection)", async () => {
      blueprintLifecycleSqlMock.auditBlueprintLifecycleSql.mockResolvedValue(passingAudit());
      const result = await akAuditTool.handler({ kind: "blueprint-lifecycle" });
      expect(blueprintLifecycleSqlMock.auditBlueprintLifecycleSql).toHaveBeenCalledTimes(1);
      expect(parsePayload(result).passed).toBe(true);
    });

    it("commit-message -> auditCommitMessageFile (with no message file -> graceful failure)", async () => {
      const result = await akAuditTool.handler({ kind: "commit-message" });
      const payload = parsePayload(result);
      expect(payload.passed).toBe(false);
      expect(payload.summary).toBe("commit-message audit could not run: message file missing");
      expect(payload.kind).toBe("commit-message");
    });

    it("tech-debt -> auditTechDebt", async () => {
      techDebtMock.auditTechDebt.mockReturnValue(passingAudit());
      const result = await akAuditTool.handler({ kind: "tech-debt" });
      expect(techDebtMock.auditTechDebt).toHaveBeenCalledTimes(1);
      expect(parsePayload(result).passed).toBe(true);
    });

    it("ai-contracts -> auditAiContracts", async () => {
      aiContractsMock.auditAiContracts.mockReturnValue(passingAudit());
      const result = await akAuditTool.handler({ kind: "ai-contracts" });
      expect(aiContractsMock.auditAiContracts).toHaveBeenCalledTimes(1);
      const payload = parsePayload(result);
      expect(payload.passed).toBe(true);
      expect(payload.kind).toBe("ai-contracts");
    });

    it("architecture-drift -> auditArchitectureDrift", async () => {
      architectureDriftMock.auditArchitectureDrift.mockReturnValue(passingAudit());
      const result = await akAuditTool.handler({ kind: "architecture-drift" });
      expect(architectureDriftMock.auditArchitectureDrift).toHaveBeenCalledTimes(1);
      const payload = parsePayload(result);
      expect(payload.passed).toBe(true);
      expect(payload.kind).toBe("architecture-drift");
    });

    it("cloudflare-deploy-contract -> auditCloudflareDeployContract", async () => {
      cloudflareDeployContractMock.auditCloudflareDeployContract.mockResolvedValue(passingAudit());
      const result = await akAuditTool.handler({ kind: "cloudflare-deploy-contract" });
      expect(cloudflareDeployContractMock.auditCloudflareDeployContract).toHaveBeenCalledTimes(1);
      const payload = parsePayload(result);
      expect(payload.passed).toBe(true);
      expect(payload.kind).toBe("cloudflare-deploy-contract");
    });

    it("absolute-path-policy -> auditAbsolutePathPolicy", async () => {
      absolutePathPolicyMock.auditAbsolutePathPolicy.mockReturnValue(passingAudit());
      const result = await akAuditTool.handler({ kind: "absolute-path-policy" });
      expect(absolutePathPolicyMock.auditAbsolutePathPolicy).toHaveBeenCalledTimes(1);
      const payload = parsePayload(result);
      expect(payload.passed).toBe(true);
      expect(payload.kind).toBe("absolute-path-policy");
    });

    it("no-first-party-mjs -> auditNoFirstPartyMjs", async () => {
      noFirstPartyMjsMock.auditNoFirstPartyMjs.mockReturnValue(passingAudit());
      const result = await akAuditTool.handler({ kind: "no-first-party-mjs" });
      expect(noFirstPartyMjsMock.auditNoFirstPartyMjs).toHaveBeenCalledTimes(1);
      const payload = parsePayload(result);
      expect(payload.passed).toBe(true);
      expect(payload.kind).toBe("no-first-party-mjs");
    });

    it("toolchain-isolation -> auditToolchainIsolation", async () => {
      toolchainIsolationMock.auditToolchainIsolation.mockReturnValue(passingAudit());
      const result = await akAuditTool.handler({ kind: "toolchain-isolation" });
      expect(toolchainIsolationMock.auditToolchainIsolation).toHaveBeenCalledTimes(1);
      const payload = parsePayload(result);
      expect(payload.passed).toBe(true);
      expect(payload.kind).toBe("toolchain-isolation");
    });

    it("open-source-licenses -> auditOpenSourceLicenses", async () => {
      openSourceLicensesMock.auditOpenSourceLicenses.mockReturnValue(passingAudit());
      const result = await akAuditTool.handler({ kind: "open-source-licenses" });
      expect(openSourceLicensesMock.auditOpenSourceLicenses).toHaveBeenCalledTimes(1);
      const payload = parsePayload(result);
      expect(payload.passed).toBe(true);
      expect(payload.kind).toBe("open-source-licenses");
    });

    it("harness-surfaces -> auditHarnessSurfaces", async () => {
      harnessSurfacesMock.auditHarnessSurfaces.mockReturnValue(passingAudit());
      const result = await akAuditTool.handler({ kind: "harness-surfaces", cwd: "/repo" });
      expect(harnessSurfacesMock.auditHarnessSurfaces).toHaveBeenCalledWith("/repo");
      const payload = parsePayload(result);
      expect(payload.passed).toBe(true);
      expect(payload.kind).toBe("harness-surfaces");
      expect(payload.summary).toBe("harness-surfaces audit passed (1 checked)");
    });

    it("weakness-mining -> auditWeaknessMining", async () => {
      weaknessMiningMock.auditWeaknessMining.mockResolvedValue(passingAudit());
      const result = await akAuditTool.handler({ kind: "weakness-mining", cwd: "/repo" });
      expect(weaknessMiningMock.auditWeaknessMining).toHaveBeenCalledWith("/repo");
      const payload = parsePayload(result);
      expect(payload.passed).toBe(true);
      expect(payload.kind).toBe("weakness-mining");
      expect(payload.summary).toBe("weakness-mining audit passed (1 checked)");
    });

    it("harness-overlay-evidence -> auditHarnessOverlayEvidence", async () => {
      harnessOverlayEvidenceMock.auditHarnessOverlayEvidence.mockReturnValue(passingAudit());
      const result = await akAuditTool.handler({
        kind: "harness-overlay-evidence",
        cwd: "/repo",
      });
      expect(harnessOverlayEvidenceMock.auditHarnessOverlayEvidence).toHaveBeenCalledWith("/repo");
      const payload = parsePayload(result);
      expect(payload.passed).toBe(true);
      expect(payload.kind).toBe("harness-overlay-evidence");
      expect(payload.summary).toBe("harness-overlay-evidence audit passed (1 checked)");
    });

    it("bundle-budget -> runBundleBudgetCli with directory arg", async () => {
      viteLocalMock.runBundleBudgetCli.mockResolvedValue(0);
      const result = await akAuditTool.handler({ kind: "bundle-budget", directory: "dist" });
      expect(viteLocalMock.runBundleBudgetCli).toHaveBeenCalledTimes(1);
      const args = viteLocalMock.runBundleBudgetCli.mock.calls[0]![0] as string[];
      expect(args).toContain("dist");
      expect(parsePayload(result).passed).toBe(true);
    });

    it("bundle-budget does not treat cwd as the dist target", async () => {
      viteLocalMock.runBundleBudgetCli.mockResolvedValue(0);
      const result = await akAuditTool.handler({
        kind: "bundle-budget",
        cwd: "/repo/agent-kit",
      });
      expect(viteLocalMock.runBundleBudgetCli).toHaveBeenCalledTimes(1);
      const args = viteLocalMock.runBundleBudgetCli.mock.calls[0]![0] as string[];
      expect(args).toEqual([]);
      expect(parsePayload(result).passed).toBe(true);
    });

    it("tph -> calls runTphAudit directly", async () => {
      tphRunnerMock.runTphAudit.mockResolvedValue({
        errorCount: 0,
        filesChecked: 5,
        violations: [],
        warningCount: 0,
        infoCount: 0,
      });
      const result = await akAuditTool.handler({ kind: "tph" });
      expect(tphRunnerMock.runTphAudit).toHaveBeenCalledTimes(1);
      const payload = parsePayload(result);
      expect(payload.passed).toBe(true);
      expect(payload.kind).toBe("tph");
      expect(payload.summary).toBe("tph audit passed (5 checked)");
    });

    it("tph-e2e -> calls runTphE2eAudit directly", async () => {
      tphE2eRunnerMock.runTphE2eAudit.mockResolvedValue({
        errorCount: 0,
        filesChecked: 3,
        violations: [],
        warningCount: 0,
        infoCount: 0,
      });
      const result = await akAuditTool.handler({ kind: "tph-e2e" });
      expect(tphE2eRunnerMock.runTphE2eAudit).toHaveBeenCalledTimes(1);
      const payload = parsePayload(result);
      expect(payload.passed).toBe(true);
      expect(payload.kind).toBe("tph-e2e");
    });
  });

  describe("failing audits", () => {
    it("returns {passed:false} when ok=false (no throw)", async () => {
      repoGuardrailsMock.auditCatalogDrift.mockReturnValue(failingAudit());
      const result = await akAuditTool.handler({ kind: "catalog-drift" });
      const payload = parsePayload(result);
      expect(payload.passed).toBe(false);
      expect(payload.summary).toBe("catalog-drift audit failed with 1 violation");
      expect(payload.kind).toBe("catalog-drift");
      expect(payload.details).toBeDefined();
    });

    it("catches thrown audit errors and returns {passed:false} with details message", async () => {
      repoGuardrailsMock.auditDocsFrontmatter.mockImplementation(() => {
        throw new Error("disk on fire");
      });
      const result = await akAuditTool.handler({ kind: "docs-frontmatter" });
      const payload = parsePayload(result);
      expect(payload.passed).toBe(false);
      expect(payload.summary).toBe("docs-frontmatter audit crashed");
      expect(payload.kind).toBe("docs-frontmatter");
      expect(String(payload.details)).toContain("disk on fire");
    });

    it("bundle-budget returns {passed:false} when exit code is non-zero", async () => {
      viteLocalMock.runBundleBudgetCli.mockResolvedValue(1);
      const result = await akAuditTool.handler({ kind: "bundle-budget" });
      expect(parsePayload(result).passed).toBe(false);
    });

    it("tph returns {passed:false} when violations found", async () => {
      tphRunnerMock.runTphAudit.mockResolvedValue({
        errorCount: 1,
        filesChecked: 5,
        violations: [
          { rule: "no-skip", message: "test skipped", file: "foo.test.ts", severity: "ERROR" },
        ],
        warningCount: 0,
        infoCount: 0,
      });
      const result = await akAuditTool.handler({ kind: "tph" });
      const payload = parsePayload(result);
      expect(payload.passed).toBe(false);
      expect(payload.kind).toBe("tph");
      expect(payload.summary).toBe("tph audit failed with 1 violation");
    });

    it("tph-e2e returns {passed:false} when violations found", async () => {
      tphE2eRunnerMock.runTphE2eAudit.mockResolvedValue({
        errorCount: 2,
        filesChecked: 3,
        violations: [
          { rule: "no-skip", message: "test skipped", file: "a.e2e.test.ts", severity: "ERROR" },
          { rule: "no-only", message: "test only", file: "b.e2e.test.ts", severity: "ERROR" },
        ],
        warningCount: 0,
        infoCount: 0,
      });
      const result = await akAuditTool.handler({ kind: "tph-e2e" });
      const payload = parsePayload(result);
      expect(payload.passed).toBe(false);
      expect(payload.kind).toBe("tph-e2e");
      expect(payload.summary).toBe("tph-e2e audit failed with 2 violations");
    });
  });

  describe("input validation", () => {
    it("rejects unknown kinds via zod parse", async () => {
      const result = await akAuditTool.handler({ kind: "not-a-kind" });
      const payload = parsePayload(result);
      expect(payload.passed).toBe(false);
      expect(payload.summary).toMatch(/Invalid/);
    });
  });

  it("tph-e2e includes structured violation details in response", async () => {
    tphE2eRunnerMock.runTphE2eAudit.mockResolvedValue({
      errorCount: 1,
      filesChecked: 2,
      violations: [
        { rule: "no-skip", message: "test skipped", file: "foo.e2e.test.ts", severity: "ERROR" },
      ],
      warningCount: 0,
      infoCount: 0,
    });
    const result = await akAuditTool.handler({ kind: "tph-e2e" });
    const payload = parsePayload(result);
    expect(payload.passed).toBe(false);
    const details = payload.details as { violations: Array<{ message: string; file: string }> };
    expect(details.violations).toHaveLength(1);
    expect(details.violations[0]!.message).toContain("[no-skip]");
    expect(details.violations[0]!.file).toBe("foo.e2e.test.ts");
  });
});
