import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import {
  evaluateRepoVisibilityReadiness,
  evaluateReadmeBenchmarkClaimGate,
  evaluatePublicBenchmarkClaimGate,
  evaluateMetricClassBindingGate,
  evaluateRedactionGate,
  evaluateCapabilityDocsGate,
  evaluateCompiledRuntimeTypecheckParity,
  evaluateSecretDocsContentGate,
  hasNumericBenchmarkClaim,
  listFirstPartyBenchmarkResultCards,
  evaluatePluginNativeLauncherPolicy,
  listPackedRuntimePayloadLeaks,
  listMissingPackedRuntimePaths,
  listMissingRuntimeOptionalDependencies,
  listMissingSessionMemoryNativeOptionalDependencies,
  listMissingShippedSecretDocs,
  runReadinessCommand,
  formatRunFailureDetail,
  PACKED_CONSUMER_SMOKE_TIMEOUT_MS,
} from "./public-readiness.js";
import type { PhaseSummary } from "./public-consumer-smoke-phases.js";
import { computeOverallStatus } from "./public-consumer-smoke-phases.js";
import {
  AGENT_KIT_TARBALL_SIZE_BUDGET_BYTES,
  AGENT_KIT_TARBALL_UNPACKED_SIZE_BUDGET_BYTES,
  evaluateAgentKitTarballSizeBudget,
} from "../src/build/runtime-surface-policy.js";

describe("public-readiness runtime policy helpers", () => {
  const runtimeManifest = {
    binaryName: "wp",
    targets: [
      {
        id: "darwin-arm64",
        os: "darwin",
        bunTarget: "bun-darwin-arm64",
        packageName: "@webpresso/agent-kit-runtime-darwin-arm64",
      },
      {
        id: "windows-x64",
        os: "win32",
        bunTarget: "bun-windows-x64",
        packageName: "@webpresso/agent-kit-runtime-windows-x64",
      },
    ],
  } as const;

  it("flags missing or mismatched runtime optional dependencies", () => {
    expect(
      listMissingRuntimeOptionalDependencies(runtimeManifest, "0.28.0", {
        "@webpresso/agent-kit-runtime-darwin-arm64": "0.28.0",
      }),
    ).toEqual(["@webpresso/agent-kit-runtime-windows-x64"]);
  });

  it("flags missing or mismatched session-memory native optional dependencies", () => {
    expect(
      listMissingSessionMemoryNativeOptionalDependencies(
        [
          {
            id: "linux-x64",
            packageName: "@webpresso/agent-kit-session-memory-linux-x64",
          },
          {
            id: "darwin-arm64",
            packageName: "@webpresso/agent-kit-session-memory-darwin-arm64",
          },
        ],
        "0.28.0",
        {
          "@webpresso/agent-kit-session-memory-linux-x64": "0.28.0",
        },
      ),
    ).toEqual(["@webpresso/agent-kit-session-memory-darwin-arm64"]);
  });

  it("accepts the pure-native Claude plugin launcher policy", () => {
    expect(
      evaluatePluginNativeLauncherPolicy({
        mcpServers: {
          webpresso: { command: "${CLAUDE_PLUGIN_ROOT}/bin/wp", args: ["mcp"] },
        },
      }),
    ).toEqual({
      commandOk: true,
      argsOk: true,
      command: "${CLAUDE_PLUGIN_ROOT}/bin/wp",
      args: ["mcp"],
    });
  });

  it("fails readiness when the compiled host runtime is missing the typecheck targeting surface", () => {
    const result = evaluateCompiledRuntimeTypecheckParity({
      runtimeBinaryPath: "/tmp/wp",
      targetId: "linux-x64",
      probe: () => ({
        ok: false,
        failures: ["typecheck --help is missing the --file flag"],
        helpOutput: "Usage: wp typecheck",
        fileOutput: "",
        expectedScopes: ["@parity/root", "@parity/widget"],
        workspaceRoot: "/tmp/runtime-parity",
      }),
    });

    expect(result).toEqual({
      name: "compiled-runtime-typecheck-parity",
      status: "FAIL",
      detail: "typecheck --help is missing the --file flag",
    });
  });

  it("passes readiness when the compiled host runtime exposes typecheck targeting parity", () => {
    const result = evaluateCompiledRuntimeTypecheckParity({
      runtimeBinaryPath: "/tmp/wp",
      targetId: "linux-x64",
      probe: () => ({
        ok: true,
        failures: [],
        helpOutput: "",
        fileOutput: "",
        expectedScopes: ["@parity/root", "@parity/widget"],
        workspaceRoot: "/tmp/runtime-parity",
      }),
    });

    expect(result).toEqual({
      name: "compiled-runtime-typecheck-parity",
      status: "PASS",
      detail: "host runtime linux-x64 exposes --file/--package and resolved scopes",
    });
  });

  it("flags missing shipped secret docs that README/runtime surfaces reference", () => {
    expect(listMissingShippedSecretDocs(["README.md"])).toContain(
      "docs/errors/wp-secret-orchestration.md",
    );
    expect(listMissingShippedSecretDocs(["README.md"])).toContain("docs/secrets/providers.md");
  });

  it("rejects placeholder-only secret docs and accepts the rewritten contract docs", () => {
    const root = mkdtempSync(join(tmpdir(), "wp-secret-doc-gate-"));
    mkdirSync(join(root, "docs", "errors"), { recursive: true });
    mkdirSync(join(root, "docs", "guides"), { recursive: true });
    mkdirSync(join(root, "docs", "secrets"), { recursive: true });
    try {
      writeFileSync(
        join(root, "docs", "README.md"),
        "# Secret orchestration\nSecret providers\nWP secret orchestration errors\n",
      );
      writeFileSync(
        join(root, "docs", "getting-started.md"),
        "wp secrets run --sink dev-server --profile preview -- codex\nsecret providers\nWP secret orchestration errors\n",
      );
      writeFileSync(
        join(root, "docs", "ci-act.md"),
        "wp secrets run --sink act --profile <profile> --\nsecretEnvProfile\nWP secret orchestration errors\n",
      );
      writeFileSync(
        join(root, "docs", "security-audits.md"),
        "secret-provider-quarantine\ndocs/secrets/providers.md\ndocs/errors/wp-secret-orchestration.md\n",
      );
      writeFileSync(
        join(root, "docs", "reusable-cloudflare-deploy-workflows.md"),
        "wp config secrets\nwp secrets run --sink <sink> --profile <profile> -- <cmd>\ndocs/secrets/bootstrap-github.md\n",
      );
      writeFileSync(
        join(root, "docs", "guides", "repo-to-preview-url.md"),
        "wp secrets doctor\nwp preview --json\nWP secret orchestration errors\n",
      );
      writeFileSync(
        join(root, "docs", "secrets", "providers.md"),
        "schemaVersion\nwp config secrets show\nwp secrets run --sink dev-server --profile preview -- codex\nshelling\nout to the configured provider CLI\n",
      );
      writeFileSync(
        join(root, "docs", "secrets", "bootstrap-github.md"),
        "WP_GITHUB_BOOTSTRAP_PLANNED\nCI_SECRET_PROVIDER_TOKEN_PRODUCTION\n--apply\n",
      );
      writeFileSync(
        join(root, "docs", "secrets", "local-workplaces.md"),
        ".git/webpresso/secrets.json\ngit-common-dir\nwp config secrets status\n",
      );
      writeFileSync(
        join(root, "docs", "secrets", "pulumi.md"),
        "wp secrets run --sink pulumi --profile preview -- pulumi preview\nenv injection only\nfull\n",
      );
      writeFileSync(
        join(root, "docs", "errors", "wp-secret-orchestration.md"),
        "WP_SECRETS_CONFIG_INVALID\nWP_GITHUB_BOOTSTRAP_MISSING_SECRET\nWP_SECRETS_RUN_USAGE\n",
      );

      expect(evaluateSecretDocsContentGate(root)).toMatchObject({ status: "FAIL" });

      writeFileSync(
        join(root, "docs", "secrets", "providers.md"),
        [
          "schemaVersion",
          "wp config secrets show",
          "wp secrets run --sink dev-server --profile preview -- codex",
          "shelling",
          "out to the configured provider CLI",
          ...Array.from({ length: 60 }, (_, index) => `word${index}`),
        ].join(" "),
      );
      for (const file of [
        join(root, "docs", "README.md"),
        join(root, "docs", "getting-started.md"),
        join(root, "docs", "ci-act.md"),
        join(root, "docs", "security-audits.md"),
        join(root, "docs", "reusable-cloudflare-deploy-workflows.md"),
        join(root, "docs", "guides", "repo-to-preview-url.md"),
        join(root, "docs", "secrets", "bootstrap-github.md"),
        join(root, "docs", "secrets", "local-workplaces.md"),
        join(root, "docs", "secrets", "pulumi.md"),
        join(root, "docs", "errors", "wp-secret-orchestration.md"),
      ]) {
        const text = readFileSync(file, "utf8");
        writeFileSync(
          file,
          `${text} ${Array.from({ length: 60 }, (_, index) => `extra${index}`).join(" ")}`,
        );
      }

      expect(evaluateSecretDocsContentGate(root)).toMatchObject({ status: "PASS" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("flags missing packed thin-root artifacts including the staged host launcher", () => {
    expect(listMissingPackedRuntimePaths(runtimeManifest, ["bin/runtime-manifest.json"])).toEqual([
      "bin/wp",
    ]);
  });

  it("permits prebuilt native artifacts while flagging native source workspaces", () => {
    expect(
      listPackedRuntimePayloadLeaks([
        "bin/runtime/darwin-arm64/session_memory.node",
        "bin/runtime/darwin-arm64/wp",
        "dist/runtime/darwin-arm64/session_memory.node",
        "dist/runtime/darwin-arm64/wp",
        "dist/runtime-packages/agent-kit-runtime-darwin-arm64/bin/session_memory.node",
        "dist/runtime-packages/agent-kit-runtime-darwin-arm64/bin/wp",
        "native/session-memory-engine/Cargo.toml",
        "bin/wp",
      ]),
    ).toEqual([
      "bin/runtime/darwin-arm64/wp",
      "dist/runtime/darwin-arm64/wp",
      "dist/runtime-packages/agent-kit-runtime-darwin-arm64/bin/wp",
      "native/session-memory-engine/Cargo.toml",
    ]);
  });

  it("enforces an explicit tarball size budget for the thin-root runtime surface", () => {
    expect(
      evaluateAgentKitTarballSizeBudget({
        size: AGENT_KIT_TARBALL_SIZE_BUDGET_BYTES,
        unpackedSize: AGENT_KIT_TARBALL_UNPACKED_SIZE_BUDGET_BYTES,
      }),
    ).toMatchObject({ sizeOk: true, unpackedOk: true });

    expect(
      evaluateAgentKitTarballSizeBudget({
        size: AGENT_KIT_TARBALL_SIZE_BUDGET_BYTES + 1,
        unpackedSize: AGENT_KIT_TARBALL_UNPACKED_SIZE_BUDGET_BYTES + 1,
      }),
    ).toMatchObject({ sizeOk: false, unpackedOk: false });
  });

  it("requires README numeric benchmark claims to point at checked-in first-party result cards", () => {
    const root = mkdtempSync(join(tmpdir(), "wp-readiness-claim-gate-"));
    mkdirSync(join(root, "docs/bench/result-cards"), { recursive: true });
    writeFileSync(join(root, "docs/bench/result-card-contract.md"), "# contract\n");
    writeFileSync(join(root, "docs/bench/result-cards/README.md"), "# cards\n");
    const markerText =
      "Public numeric benchmark claims require a checked-in first-party result card under docs/bench/result-cards/; see docs/bench/result-card-contract.md.";
    try {
      expect(hasNumericBenchmarkClaim("Session restore latency is 42ms faster.")).toBe(true);
      expect(hasNumericBenchmarkClaim(markerText)).toBe(false);
      expect(evaluateReadmeBenchmarkClaimGate(markerText, root)).toMatchObject({ status: "PASS" });

      expect(
        evaluateReadmeBenchmarkClaimGate(
          `${markerText} Session restore latency is 42ms faster.`,
          root,
        ),
      ).toMatchObject({ status: "FAIL" });

      mkdirSync(join(root, "scripts/bench/runs/local-2026-06-19"), { recursive: true });
      writeFileSync(
        join(root, "scripts/bench/runs/local-2026-06-19/report.md"),
        [
          "# Session-memory benchmark",
          "",
          "## Threshold report",
          "",
          "| axis | metric | threshold | observed | status |",
          "| --- | --- | ---: | ---: | --- |",
          "| restore_latency_ms | latency_ms | 1000 | 42 | passed |",
        ].join("\n"),
      );
      writeFileSync(
        join(root, "docs/bench/result-cards/session-memory-2026-06-19.md"),
        [
          "# Session memory result card",
          "Command: wp bench session-memory --scenario restore --variant baseline --trials 1",
          "Git commit: 252f4fcf",
          "Run id: local-2026-06-19",
          "Raw run artifact: scripts/bench/runs/local-2026-06-19/report.md",
          "Scenario id: restore",
          "Variant set: baseline",
          "Trial count: 1",
          "Workspace/auth mode: isolated/api-key",
          "Cache-isolation disclaimer: none",
          "Environment: CI linux x64",
          "Tool versions: pnpm, cargo",
          "| metric | threshold | result | status |",
          "| --- | ---: | ---: | --- |",
          "| restore_latency_ms | 1000 | 42 | passed |",
        ].join("\n"),
      );
      const evidencePath = "docs/bench/result-cards/session-memory-2026-06-19.md";
      expect(listFirstPartyBenchmarkResultCards(root)).toEqual([evidencePath]);
      expect(
        evaluateReadmeBenchmarkClaimGate(
          `${markerText} Session restore latency is 42ms faster.`,
          root,
        ),
      ).toMatchObject({ status: "FAIL" });
      expect(
        evaluateReadmeBenchmarkClaimGate(
          `${markerText} Session restore latency is 42ms faster; see ${evidencePath}.`,
          root,
        ),
      ).toMatchObject({ status: "PASS" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("requires benchmark claims on public docs, latest changelog, and pending changesets to cite valid result cards", () => {
    const root = mkdtempSync(join(tmpdir(), "wp-readiness-public-claim-gate-"));
    mkdirSync(join(root, "docs/bench/result-cards"), { recursive: true });
    mkdirSync(join(root, ".changeset"), { recursive: true });
    writeFileSync(join(root, "README.md"), "No benchmark claims here.\n");
    writeFileSync(join(root, "package.json"), '{"description":"plain"}\n');
    writeFileSync(join(root, "docs/bench/result-card-contract.md"), "# contract\n");
    writeFileSync(join(root, "docs/bench/result-cards/README.md"), "# cards\n");
    writeFileSync(join(root, "CHANGELOG.md"), "## 1.0.0\n\nNative restore is 42ms faster.\n");
    writeFileSync(
      join(root, ".changeset/native-speed.md"),
      "Native session-memory is 2x faster.\n",
    );

    try {
      expect(evaluatePublicBenchmarkClaimGate(root)).toMatchObject({
        status: "FAIL",
        detail: expect.stringContaining("CHANGELOG.md#latest"),
      });

      mkdirSync(join(root, "scripts/bench/runs/local-2026-06-19"), { recursive: true });
      writeFileSync(
        join(root, "scripts/bench/runs/local-2026-06-19/report.md"),
        [
          "# Session-memory benchmark",
          "",
          "## Threshold report",
          "",
          "| axis | metric | threshold | observed | status |",
          "| --- | --- | ---: | ---: | --- |",
          "| restore_latency_ms | latency_ms | 1000 | 42 | passed |",
        ].join("\n"),
      );
      const evidencePath = "docs/bench/result-cards/session-memory-2026-06-19.md";
      writeFileSync(
        join(root, evidencePath),
        [
          "# Session memory result card",
          "Command: wp bench session-memory --scenario restore --variant baseline --trials 1",
          "Git commit: 252f4fcf",
          "Run id: local-2026-06-19",
          "Raw run artifact: scripts/bench/runs/local-2026-06-19/report.md",
          "Scenario id: restore",
          "Variant set: baseline",
          "Trial count: 1",
          "Workspace/auth mode: isolated/api-key",
          "Cache-isolation disclaimer: none",
          "Environment: CI linux x64",
          "Tool versions: pnpm, cargo",
          "| metric | threshold | result | status |",
          "| --- | ---: | ---: | --- |",
          "| restore_latency_ms | 1000 | 42 | passed |",
        ].join("\n"),
      );
      writeFileSync(
        join(root, "CHANGELOG.md"),
        `## 1.0.0\n\nNative restore is 42ms faster; see ${evidencePath}.\n`,
      );
      writeFileSync(
        join(root, ".changeset/native-speed.md"),
        `Native session-memory is 2x faster; see ${evidencePath}.\n`,
      );

      expect(evaluatePublicBenchmarkClaimGate(root)).toMatchObject({ status: "PASS" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("packs the prepared manifest with scripts disabled to avoid double prepack", () => {
    const source = readFileSync(join(import.meta.dirname, "public-readiness.ts"), "utf8");
    const packIndex = source.indexOf("--dry-run");

    expect(packIndex).toBeGreaterThan(source.indexOf("preparePackedManifest(ROOT)"));
    expect(source.indexOf("restorePackedManifest(ROOT)", packIndex)).toBeGreaterThan(packIndex);
  });

  it("runs readiness subprocesses with explicit bounded timeouts and diagnostic failure text", () => {
    let receivedOptions: unknown;
    const result = runReadinessCommand(
      "node",
      ["slow.js"],
      {},
      {
        timeoutMs: 123,
        execFileSyncImpl: (_command, _args, options) => {
          receivedOptions = options;
          const error = new Error("spawnSync node ETIMEDOUT") as Error & {
            stdout?: string;
            stderr?: string;
            status?: number;
            signal?: string;
          };
          error.stdout = "partial stdout";
          error.stderr = "partial stderr";
          error.signal = "SIGTERM";
          throw error;
        },
      },
    );

    expect(receivedOptions).toMatchObject({ timeout: 123, killSignal: "SIGTERM" });
    expect(result).toMatchObject({ ok: false, timedOut: true, timeoutMs: 123 });
    expect(formatRunFailureDetail(result)).toContain("timed out after 123ms");
    expect(formatRunFailureDetail(result)).toContain("partial stderr");
  });

  it("keeps the public-readiness smoke bound above the smoke script setup phase budget", () => {
    const readinessSource = readFileSync(join(import.meta.dirname, "public-readiness.ts"), "utf8");
    const smokeSource = readFileSync(join(import.meta.dirname, "public-consumer-smoke.ts"), "utf8");

    expect(PACKED_CONSUMER_SMOKE_TIMEOUT_MS).toBeGreaterThanOrEqual(8 * 60 * 1000);
    expect(readinessSource).toContain("{ timeoutMs: PACKED_CONSUMER_SMOKE_TIMEOUT_MS }");
    expect(smokeSource).toContain("const DEFAULT_PHASE_TIMEOUT_MS = 5 * 60 * 1000");
    expect(smokeSource).toContain("timeout: timeoutMs");
    expect(smokeSource).toContain("timeout: TARBALL_CONTRACT_TIMEOUT_MS");
  });
});

describe("public release readiness gate wiring", () => {
  const repositoryRoot = join(import.meta.dirname, "..");

  it("exercises host fallback skill projection in the packed consumer smoke", () => {
    const source = readFileSync(
      join(repositoryRoot, "scripts", "public-consumer-smoke.ts"),
      "utf8",
    );

    expect(source).toContain("--project-init");
    expect(source).toContain("WP_SKIP_CLAUDE_PLUGIN");
    expect(source).toContain("WP_SKIP_CODEX_PLUGIN");
    expect(source).toContain("--host");
    expect(source).toMatch(/['"]all['"]/);
    expect(source).not.toMatch(/['"]none['"]/);
  });

  it("evaluates public repository visibility from explicit history evidence", () => {
    expect(
      evaluateRepoVisibilityReadiness({
        repoAlreadyPublic: false,
        historyClassification: "clean-public-snapshot-preferred",
        publicHistoryTaskStatus: "done",
      }),
    ).toEqual({
      name: "repo-visibility-readiness",
      status: "PASS",
      detail: "clean-public-snapshot-preferred executed",
    });

    expect(
      evaluateRepoVisibilityReadiness({
        repoAlreadyPublic: false,
        historyClassification: "clean-public-snapshot-preferred",
        publicHistoryTaskStatus: "planned",
      }),
    ).toEqual({
      name: "repo-visibility-readiness",
      status: "BLOCKED",
      detail: "clean-public-snapshot-preferred; public history Task 1.5 still pending",
    });

    expect(
      evaluateRepoVisibilityReadiness({
        repoAlreadyPublic: true,
        historyClassification: "missing",
        publicHistoryTaskStatus: null,
      }),
    ).toEqual({
      name: "repo-visibility-readiness",
      status: "PASS",
      detail: "repository already public; snapshot strategy superseded by operator override",
    });
  });

  it("loads public-repository history evidence from the public-release scrub task", () => {
    const source = readFileSync(join(repositoryRoot, "scripts", "public-readiness.ts"), "utf8");

    expect(source).toContain("blueprints/completed/agent-kit-public-release-scrub/_overview.md");
    expect(source).toContain("PUBLIC_HISTORY_TASK_ID");
    expect(source).toContain("1.5");
    expect(source).not.toContain("2026-06-01-agent-kit-global-distribution-mcp-runtime-fix.md");
  });

  it("keeps session execute public descriptions honest about native fallback", () => {
    const executeSource = readFileSync(
      join(repositoryRoot, "src", "mcp", "tools", "_session-execute.ts"),
      "utf8",
    );
    const batchSource = readFileSync(
      join(repositoryRoot, "src", "mcp", "tools", "_session-batch-execute.ts"),
      "utf8",
    );
    const guide = readFileSync(join(repositoryRoot, "docs", "guides", "session-memory.md"), "utf8");

    for (const surface of [executeSource, batchSource, guide]) {
      expect(surface).toContain("native backend when available");
      expect(surface).toContain("TypeScript fallback otherwise");
      expect(surface).not.toContain("through the native session-memory engine");
    }
  });

  it("does not keep inert nested native-engine GitHub workflows that root CI will not run", () => {
    for (const workflow of ["bench.yml", "check.yml", "mutation.yml"]) {
      expect(
        existsSync(
          join(repositoryRoot, "native", "session-memory-engine", ".github", "workflows", workflow),
        ),
      ).toBe(false);
    }
  });
});

describe("G2: metric-class binding gate", () => {
  function makeRoot(): string {
    const root = mkdtempSync(join(tmpdir(), "wp-metric-class-gate-"));
    mkdirSync(join(root, "docs/bench/result-cards"), { recursive: true });
    writeFileSync(join(root, "docs/bench/result-card-contract.md"), "# contract\n");
    writeFileSync(join(root, "docs/bench/result-cards/README.md"), "# cards\n");
    mkdirSync(join(root, "scripts/bench/runs/local-2026-06-19"), { recursive: true });
    writeFileSync(
      join(root, "scripts/bench/runs/local-2026-06-19/report.md"),
      [
        "# Bench report",
        "",
        "## Threshold report",
        "",
        "| axis | metric | threshold | observed | status |",
        "| --- | --- | ---: | ---: | --- |",
        "| gainBytes | gainBytes | 100 | 200 | passed |",
      ].join("\n"),
    );
    return root;
  }

  function writeByteProxyCard(root: string): string {
    const cardPath = "docs/bench/result-cards/byte-proxy-2026-06-19.md";
    writeFileSync(
      join(root, cardPath),
      [
        "# Byte proxy result card",
        "Command: wp bench session-memory --scenario restore --variant baseline --trials 1",
        "Git commit: abcdef01",
        "Run id: local-2026-06-19",
        "Raw run artifact: scripts/bench/runs/local-2026-06-19/report.md",
        "Scenario id: restore",
        "Variant set: baseline",
        "Trial count: 1",
        "Workspace/auth mode: isolated/api-key",
        "Cache-isolation disclaimer: none",
        "Environment: CI linux x64",
        "Tool versions: pnpm, cargo",
        "| metric | threshold | result | status |",
        "| --- | ---: | ---: | --- |",
        "| gainBytes | 100 | 200 | passed |",
      ].join("\n"),
    );
    return cardPath;
  }

  it("byte-proxy card does NOT satisfy a provider-tokens-cost claim", () => {
    const root = makeRoot();
    try {
      // Write a surface with a provider-tokens-cost claim
      writeFileSync(
        join(root, "README.md"),
        "Public numeric benchmark claims require a checked-in first-party result card under docs/bench/result-cards/; see docs/bench/result-card-contract.md.\n" +
          "Token savings: 99% cost reduction for users.\n",
      );
      writeFileSync(join(root, "package.json"), '{"description":"plain"}\n');
      writeByteProxyCard(root);

      const result = evaluateMetricClassBindingGate(root);
      expect(result.status).toStrictEqual("FAIL");
      expect(result.detail).toContain("provider_tokens_cost");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("byte-proxy card satisfies a byte-proxy claim", () => {
    const root = makeRoot();
    try {
      writeFileSync(
        join(root, "README.md"),
        "Public numeric benchmark claims require a checked-in first-party result card under docs/bench/result-cards/; see docs/bench/result-card-contract.md.\n" +
          "Session capture cut context by 200 bytes per run (byte reduction).\n",
      );
      writeFileSync(join(root, "package.json"), '{"description":"plain"}\n');
      writeByteProxyCard(root);

      const result = evaluateMetricClassBindingGate(root);
      expect(result.status).toStrictEqual("PASS");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("does NOT flag descriptive keyword mentions that are not benchmark claims", () => {
    const root = makeRoot();
    try {
      // Mentions of the rtk preset, NAPI packaging, and the reference-parity
      // audit are descriptive — no number/unit, no savings phrasing — so they
      // must not be treated as metric-class claims.
      writeFileSync(
        join(root, "README.md"),
        "Uses the rtk preset and resolves prebuilt NAPI packages when available.\n" +
          "Run the reference-parity-matrix audit before promoting replacement-parity claims.\n",
      );
      writeFileSync(join(root, "package.json"), '{"description":"plain"}\n');

      const result = evaluateMetricClassBindingGate(root);
      expect(result.status).toStrictEqual("PASS");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("still flags a genuine unbacked native-speedup claim", () => {
    const root = makeRoot();
    try {
      // A real quantitative speedup claim with only a byte-proxy card on disk
      // must remain fail-closed: native_speedup is not byte_proxy.
      writeFileSync(
        join(root, "README.md"),
        "The native backend delivers a 3x speedup over the TypeScript fallback.\n",
      );
      writeFileSync(join(root, "package.json"), '{"description":"plain"}\n');
      writeByteProxyCard(root);

      const result = evaluateMetricClassBindingGate(root);
      expect(result.status).toStrictEqual("FAIL");
      expect(result.detail).toContain("native_speedup");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("excludes the contract/methodology meta-docs from claim scanning", () => {
    const root = makeRoot();
    try {
      writeFileSync(join(root, "README.md"), "No claims here.\n");
      writeFileSync(join(root, "package.json"), '{"description":"plain"}\n');
      // The contract doc DEFINES the taxonomy (recall@k, provider token savings)
      // and carries the byte!=token disclaimer — it must not register as a claim.
      writeFileSync(
        join(root, "docs/bench/result-card-contract.md"),
        "# Contract\n\n" +
          "| `recall` | Information-retrieval recall@k from qrels |\n" +
          "A `byte_proxy` measurement does NOT prove provider token savings.\n",
      );
      writeFileSync(
        join(root, "docs/bench/session-memory-methodology.md"),
        "# Methodology\n\nNative restore is 42ms faster in our example table.\n",
      );

      expect(evaluateMetricClassBindingGate(root).status).toStrictEqual("PASS");
      expect(evaluatePublicBenchmarkClaimGate(root).status).toStrictEqual("PASS");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("G4: redaction gate", () => {
  it("planted secret in a docs/bench file returns FAIL", () => {
    const root = mkdtempSync(join(tmpdir(), "wp-redaction-gate-"));
    try {
      mkdirSync(join(root, "docs/bench/result-cards"), { recursive: true });
      writeFileSync(
        join(root, "docs/bench/result-card-contract.md"),
        "Environment: CI\nANTHROPIC_API_KEY=sk-ant-secret123456789012345678901234567890\n",
      );

      const result = evaluateRedactionGate(root);
      expect(result.status).toStrictEqual("FAIL");
      expect(result.detail).toContain("result-card-contract.md");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("clean bench docs return PASS", () => {
    const root = mkdtempSync(join(tmpdir(), "wp-redaction-gate-clean-"));
    try {
      mkdirSync(join(root, "docs/bench/result-cards"), { recursive: true });
      writeFileSync(
        join(root, "docs/bench/result-card-contract.md"),
        "# Contract\nEnvironment: CI linux x64\nNo secrets here.\n",
      );

      const result = evaluateRedactionGate(root);
      expect(result.status).toStrictEqual("PASS");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("G5: capability docs gate", () => {
  it("unbacked measured capability claim in docs returns FAIL", () => {
    const root = mkdtempSync(join(tmpdir(), "wp-capability-docs-gate-"));
    try {
      mkdirSync(join(root, "docs/bench"), { recursive: true });
      // 'compaction' is 'planned' in CAPABILITY_REGISTRY (not measured + no artifactPath)
      writeFileSync(
        join(root, "docs/bench/reference-parity-matrix.md"),
        "# Reference parity matrix\n\ncompaction: measured\n",
      );

      const result = evaluateCapabilityDocsGate(root);
      expect(result.status).toStrictEqual("FAIL");
      expect(result.detail).toContain("compaction");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("no reference-parity-matrix.md returns PASS", () => {
    const root = mkdtempSync(join(tmpdir(), "wp-capability-docs-gate-absent-"));
    try {
      const result = evaluateCapabilityDocsGate(root);
      expect(result.status).toStrictEqual("PASS");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});

describe("G6: phased consumer-smoke aggregation", () => {
  it("BLOCKED phase alone produces overall BLOCKED (not FAIL)", () => {
    const phases: PhaseSummary["phases"] = [
      {
        phase: "pack",
        status: "PASS",
        durationMs: 100,
        capturedOutput: "",
      },
      {
        phase: "install",
        status: "BLOCKED",
        durationMs: 0,
        capturedOutput: "",
        blockReason: "missing npm auth",
      },
    ];

    const overall = computeOverallStatus(phases);
    expect(overall).toStrictEqual("BLOCKED");
  });

  it("FAIL phase dominates over BLOCKED", () => {
    const phases: PhaseSummary["phases"] = [
      {
        phase: "pack",
        status: "FAIL",
        durationMs: 50,
        capturedOutput: "error output",
      },
      {
        phase: "install",
        status: "BLOCKED",
        durationMs: 0,
        capturedOutput: "",
        blockReason: "upstream failed",
      },
    ];

    const overall = computeOverallStatus(phases);
    expect(overall).toStrictEqual("FAIL");
  });
});
