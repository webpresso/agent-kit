import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { auditAiContracts } from "./ai-contracts.js";

const tempDirs: string[] = [];

const evidencePaths = [
  "docs/bench/reference-parity-matrix.md",
  "src/__integration__/reference-parity-host-smoke.integration.test.ts",
  "src/__integration__/reference-parity-tool-surface.integration.test.ts",
  "docs/bench/session-memory-methodology.md",
] as const;

function tempRoot(): string {
  const root = mkdtempSync(path.join(os.tmpdir(), "wp-reference-claims-"));
  tempDirs.push(root);
  return root;
}

function write(root: string, relativePath: string, content: string): void {
  const filePath = path.join(root, relativePath);
  mkdirSync(path.dirname(filePath), { recursive: true });
  writeFileSync(filePath, content, "utf8");
}

function seedAiContractSurfaces(root: string): void {
  write(
    root,
    "docs/ai-reliability-contract.md",
    ["# AI Reliability Contract", "", "## Contract Rules"].join("\n"),
  );
  write(
    root,
    "src/mcp/tools/_shared/result.ts",
    [
      "export function createSummaryResult(payload: unknown, options: { isError?: boolean } = {}) {",
      "return { structuredContent: payload, ...(options.isError ? { isError: true } : {}) }",
      "}",
    ].join("\n"),
  );
  write(
    root,
    "src/mcp/auto-discover.ts",
    [
      "export interface ToolHandlerResult {",
      "readonly structuredContent?: Record<string, unknown>",
      "readonly isError?: boolean",
      "}",
      "export interface ToolDescriptor {",
      "readonly outputSchema?: unknown",
      "}",
    ].join("\n"),
  );
  write(
    root,
    "src/mcp/server.integration.test.ts",
    "it('checks tools/list and structuredContent', () => { 'tools/list'; 'structuredContent' })",
  );

  for (const toolPath of [
    "src/mcp/tools/test.ts",
    "src/mcp/tools/lint.ts",
    "src/mcp/tools/typecheck.ts",
    "src/mcp/tools/qa.ts",
    "src/mcp/tools/audit.ts",
  ]) {
    write(
      root,
      toolPath,
      [
        "const outputSchema = {}",
        "const errorResult = { isError: true }",
        "const tool = { outputSchema, handler: () => createSummaryResult({}) }",
        "export default tool",
      ].join("\n"),
    );
  }

  for (const toolPath of ["src/mcp/tools/format.ts", "src/mcp/tools/ci-act.ts"]) {
    write(
      root,
      toolPath,
      ["const tool = { handler: () => ({ isError: true }) }", "export default tool"].join("\n"),
    );
  }
}

function seedReferenceParityProof(root: string, options: { releaseReady?: boolean } = {}): void {
  const releaseReady = options.releaseReady ?? false;
  const rows = [
    [
      "lifecycle capture",
      "session memory store",
      "full",
      "src/session-memory/session.test.ts",
      "yes",
      "passed",
    ],
    [
      "resume injection",
      "Claude, Codex, Cursor, OpenCode",
      releaseReady ? "full" : "degraded",
      "src/hooks/sessionstart/index.test.ts",
      "yes",
      releaseReady ? "passed" : "open",
    ],
    [
      "tool discovery",
      "MCP session tools",
      releaseReady ? "full" : "degraded",
      "src/__integration__/reference-parity-tool-surface.integration.test.ts",
      "yes",
      releaseReady ? "passed" : "open",
    ],
    [
      "indexed search",
      "session memory store",
      "full",
      "src/session-memory/store.test.ts",
      "yes",
      "passed",
    ],
    [
      "host setup smoke",
      "Claude, Codex, Cursor, OpenCode",
      releaseReady ? "full" : "degraded",
      "src/__integration__/reference-parity-host-smoke.integration.test.ts",
      "yes",
      "passed",
    ],
    [
      "benchmark thresholds",
      "continuity and search benchmarks",
      releaseReady ? "full" : "degraded",
      "src/__integration__/reference-parity-bench.integration.test.ts",
      "yes",
      releaseReady ? "passed" : "open",
    ],
    [
      "release claim gating",
      "public docs and release audits",
      releaseReady ? "full" : "degraded",
      "src/audit/reference-parity-claims.test.ts",
      "yes",
      releaseReady ? "passed" : "open",
    ],
  ];
  write(
    root,
    "docs/bench/reference-parity-matrix.md",
    [
      "| capability | host scope | support level | proof artifact | required for release | status |",
      "| --- | --- | --- | --- | --- | --- |",
      ...rows.map((row) => `| ${row.join(" | ")} |`),
      "",
    ].join("\n"),
  );

  for (const artifact of rows.map((row) => row[3]!)) write(root, artifact, "proof");
  write(root, "docs/bench/session-memory-methodology.md", "bench methodology");
}

function publicClaimText(extra = ""): string {
  return [
    "Release claims are gated by:",
    ...evidencePaths.map((evidencePath) => `- ${evidencePath}`),
    extra,
  ].join("\n");
}

function seedPublicSurfaces(root: string, extra = ""): void {
  write(root, "README.md", publicClaimText(extra));
  write(
    root,
    "CHANGELOG.md",
    ["# Changelog", "", "## Unreleased", "", publicClaimText(extra)].join("\n"),
  );
}

afterEach(() => {
  while (tempDirs.length > 0) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

describe("reference parity public claim gate", () => {
  it("passes safe public wording that cites the required proof set while rows are open", () => {
    const root = tempRoot();
    seedAiContractSurfaces(root);
    seedReferenceParityProof(root);
    seedPublicSurfaces(
      root,
      "Open and degraded rows stay visible until strict readiness is green.",
    );

    const result = auditAiContracts(root);

    expect(result.ok).toBe(true);
  });

  it("fails closed on full replacement wording before strict readiness is green", () => {
    const root = tempRoot();
    seedAiContractSurfaces(root);
    seedReferenceParityProof(root);
    seedPublicSurfaces(root, "This is full replacement parity for every host.");

    const result = auditAiContracts(root);

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: "README.md",
          message:
            "Public release wording must not claim full replacement parity until reference parity strict readiness passes.",
        }),
      ]),
    );
  });

  it("requires README and current changelog entry to cite checklist, host smoke, tool smoke, and bench evidence", () => {
    const root = tempRoot();
    seedAiContractSurfaces(root);
    seedReferenceParityProof(root, { releaseReady: true });
    write(root, "README.md", "Release claim without evidence");
    write(root, "CHANGELOG.md", "# Changelog\n\n## Unreleased\n\nRelease claim without evidence");

    const result = auditAiContracts(root);

    expect(result.ok).toBe(false);
    expect(result.violations.map((violation) => violation.message)).toContain(
      "Reference parity public claim gate must cite docs/bench/reference-parity-matrix.md.",
    );
  });

  it("requires pending changeset release notes to cite the gate before the version PR is generated", () => {
    const root = tempRoot();
    seedAiContractSurfaces(root);
    seedReferenceParityProof(root);
    seedPublicSurfaces(root);
    write(
      root,
      ".changeset/host-lifecycle-claim.md",
      [
        "---",
        '"@webpresso/agent-kit": minor',
        "---",
        "",
        "Deliver agent-kit skills through exactly one channel per host.",
      ].join("\n"),
    );

    const result = auditAiContracts(root);

    expect(result.ok).toBe(false);
    expect(result.violations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          file: ".changeset/*.md",
          message:
            "Pending changeset release notes must cite docs/bench/reference-parity-matrix.md before Changesets generates CHANGELOG.md.",
        }),
      ]),
    );
  });
});
