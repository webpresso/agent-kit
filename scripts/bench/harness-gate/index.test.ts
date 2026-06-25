import { spawnSync } from "node:child_process";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildHarnessGateVerdict,
  collectChangedFilesFromGit,
  compareHarnessGateMeasurements,
  detectTriggeredSurfaces,
  formatHarnessGateReport,
  loadHarnessGatePlan,
  measureHarnessGateSamples,
} from "./index.ts";

describe("harness gate runner", () => {
  let root: string;
  let consumerRoot: string;

  beforeEach(() => {
    root = join(tmpdir(), `wp-harness-gate-${Date.now()}-${Math.random().toString(36).slice(2)}`);
    consumerRoot = join(
      tmpdir(),
      `wp-harness-consumer-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    );
    mkdirSync(join(root, "catalog", "agent", "harness-gate"), { recursive: true });
    mkdirSync(join(root, "catalog", "agent"), { recursive: true });
    mkdirSync(join(consumerRoot, "harness-gate"), { recursive: true });
    writeFileSync(
      join(root, "catalog", "agent", "harness-surfaces.yaml"),
      "version: 1\nsurfaces:\n  - id: codex-hooks\n    paths:\n      - path: src/hooks\n        status: concrete\n    evidence: [src/hooks/pretool-guard/index.ts]\n",
    );
    writeFileSync(
      join(root, "catalog", "agent", "harness-gate", "consumers.yaml"),
      `version: 1\nconsumers:\n  - id: sample\n    repo: sample\n    worktreeAlias: ignored\n    suiteManifest: harness-gate/suites.yaml\n    harnessSurfaces: [codex-hooks]\n    heldInSuites: [sample.smoke]\n    heldOutSuites: [sample.deep]\n`,
    );
    writeFileSync(
      join(consumerRoot, "harness-gate", "suites.yaml"),
      "version: 1\nconsumer: sample\nsuites:\n  - id: sample.smoke\n    tier: held-in\n    command: echo smoke\n    surfaces: [codex-hooks]\n    proof: smoke proof\n  - id: sample.deep\n    tier: held-out\n    command: echo deep\n    surfaces: [codex-hooks]\n    proof: deep proof\n",
    );
    process.env.HARNESS_GATE_SAMPLE_ROOT = consumerRoot;
  });

  afterEach(async () => {
    delete process.env.HARNESS_GATE_SAMPLE_ROOT;
    await import("node:fs/promises").then(async (fs) => {
      await fs.rm(root, { recursive: true, force: true });
      await fs.rm(consumerRoot, { recursive: true, force: true });
    });
  });

  it("loads consumer suite manifests and validates declared suite ids", () => {
    const plan = loadHarnessGatePlan(root);

    expect(plan.suites.map((suite) => suite.id)).toEqual(["sample.smoke", "sample.deep"]);
    expect(plan.suites.map((suite) => suite.suiteSource)).toEqual(["manifest", "manifest"]);
  });

  it("detects changed harness surfaces and creates planned verdicts", () => {
    const plan = loadHarnessGatePlan(root);
    const triggeredSurfaces = detectTriggeredSurfaces(["src/hooks/pretool-guard/index.ts"], root);
    const verdict = buildHarnessGateVerdict({ plan, triggeredSurfaces, rootDirectory: root });

    expect(triggeredSurfaces).toEqual(["codex-hooks"]);
    expect(verdict.ok).toBe(true);
    expect(verdict.mode).toBe("planned-only");
    expect(verdict.comparisonMode).toBe("selection-only");
    expect(verdict.coverageFailures).toEqual([]);
    expect(verdict.plannedOnly).toBe(true);
    expect(verdict.manifestBacked).toBe(true);
    expect(verdict.suites.map((suite) => suite.status)).toEqual(["planned", "planned"]);
  });

  it("labels synthetic suites when downstream manifests are unavailable", () => {
    rmSync(join(consumerRoot, "harness-gate", "suites.yaml"), { force: true });

    const plan = loadHarnessGatePlan(root);
    const verdict = buildHarnessGateVerdict({
      plan,
      triggeredSurfaces: ["codex-hooks"],
      rootDirectory: root,
    });

    expect(plan.suites.map((suite) => suite.suiteSource)).toEqual(["synthetic", "synthetic"]);
    expect(verdict.manifestBacked).toBe(false);
    expect(verdict.suites.map((suite) => suite.proof)).toEqual([
      "External manifest harness-gate/suites.yaml for sample was unavailable; planned verdict only.",
      "External manifest harness-gate/suites.yaml for sample was unavailable; planned verdict only.",
    ]);
  });

  it("produces structured JSON data with a summary-first verdict field", () => {
    const plan = loadHarnessGatePlan(root);
    const verdict = buildHarnessGateVerdict({
      plan,
      triggeredSurfaces: ["codex-hooks"],
      rootDirectory: root,
    });
    const report = formatHarnessGateReport(verdict);
    const json = JSON.stringify(report);

    expect(Object.keys(report)[0]).toBe("summary");
    expect(report.summary).toMatch(/^Harness gate PLAN PASS:/);
    expect(report.summary).toContain("selection-only");
    expect(report.summary).toContain("manifest-backed");
    expect(JSON.parse(json)).toMatchObject({
      summary: report.summary,
      ok: true,
      mode: "planned-only",
      comparisonMode: "selection-only",
      coverageFailures: [],
      triggeredSurfaces: ["codex-hooks"],
    });
  });

  it("does not label synthetic planned-only suites as executed regression evidence", () => {
    rmSync(join(consumerRoot, "harness-gate", "suites.yaml"), { force: true });
    const plan = loadHarnessGatePlan(root);
    const report = formatHarnessGateReport(
      buildHarnessGateVerdict({
        plan,
        triggeredSurfaces: ["codex-hooks"],
        rootDirectory: root,
      }),
    );

    expect(report.ok).toBe(true);
    expect(report.plannedOnly).toBe(true);
    expect(report.manifestBacked).toBe(false);
    expect(report.summary).toMatch(/^Harness gate PLAN PASS:/);
    expect(report.summary).toContain("selection-only");
    expect(report.summary).toContain("synthetic-manifest");
  });

  it("fails when a triggered harness surface has no selected suite coverage", () => {
    writeFileSync(
      join(root, "catalog", "agent", "harness-surfaces.yaml"),
      "version: 1\nsurfaces:\n  - id: codex-hooks\n    paths:\n      - path: src/hooks\n        status: concrete\n    evidence: [src/hooks/pretool-guard/index.ts]\n  - id: secret-gate\n    paths:\n      - path: src/secret-gate\n        status: concrete\n    evidence: [src/secret-gate/runner.ts]\n",
    );
    const plan = loadHarnessGatePlan(root);
    const triggeredSurfaces = detectTriggeredSurfaces(["src/secret-gate/runner.ts"], root);
    const report = formatHarnessGateReport(
      buildHarnessGateVerdict({ plan, triggeredSurfaces, rootDirectory: root }),
    );

    expect(triggeredSurfaces).toEqual(["secret-gate"]);
    expect(report.ok).toBe(false);
    expect(report.coverageFailures).toEqual([
      "no harness suite covers triggered surface secret-gate",
    ]);
    expect(report.summary).toContain("1 coverage failures");
  });

  it("reports no deltas when comparing the same baseline measurements", () => {
    const baseline = measureHarnessGateSamples([
      {
        consumer: "sample",
        suiteId: "sample.smoke",
        tier: "held-in",
        status: "passed",
        durationMs: 100,
      },
      {
        consumer: "sample",
        suiteId: "sample.smoke",
        tier: "held-in",
        status: "passed",
        durationMs: 120,
      },
      {
        consumer: "sample",
        suiteId: "sample.deep",
        tier: "held-out",
        status: "passed",
        durationMs: 200,
      },
      {
        consumer: "sample",
        suiteId: "sample.deep",
        tier: "held-out",
        status: "passed",
        durationMs: 220,
      },
    ]);

    const deltas = compareHarnessGateMeasurements(baseline, baseline);

    expect(deltas).toEqual([
      {
        consumer: "sample",
        suiteId: "sample.smoke",
        tier: "held-in",
        baselinePassRate: 1,
        candidatePassRate: 1,
        passRateDelta: 0,
        baselineMeanDurationMs: 110,
        candidateMeanDurationMs: 110,
        durationDeltaMs: 0,
        regressed: false,
      },
      {
        consumer: "sample",
        suiteId: "sample.deep",
        tier: "held-out",
        baselinePassRate: 1,
        candidatePassRate: 1,
        passRateDelta: 0,
        baselineMeanDurationMs: 210,
        candidateMeanDurationMs: 210,
        durationDeltaMs: 0,
        regressed: false,
      },
    ]);
  });

  it("reports baseline-candidate regressions from external measurements", () => {
    const plan = loadHarnessGatePlan(root);
    const baseline = measureHarnessGateSamples([
      {
        consumer: "sample",
        suiteId: "sample.deep",
        tier: "held-out",
        status: "passed",
        durationMs: 200,
      },
      {
        consumer: "sample",
        suiteId: "sample.deep",
        tier: "held-out",
        status: "passed",
        durationMs: 220,
      },
    ]);
    const candidate = measureHarnessGateSamples([
      {
        consumer: "sample",
        suiteId: "sample.deep",
        tier: "held-out",
        status: "passed",
        durationMs: 210,
      },
      {
        consumer: "sample",
        suiteId: "sample.deep",
        tier: "held-out",
        status: "failed",
        durationMs: 230,
      },
    ]);

    const report = formatHarnessGateReport(
      buildHarnessGateVerdict({
        plan,
        triggeredSurfaces: ["codex-hooks"],
        rootDirectory: root,
        baselineMeasurements: baseline,
        candidateMeasurements: candidate,
      }),
    );

    expect(report.ok).toBe(false);
    expect(report.mode).toBe("executed");
    expect(report.comparisonMode).toBe("baseline-candidate");
    expect(report.summary).toContain("baseline-candidate");
    expect(report.deltas).toEqual([
      expect.objectContaining({
        suiteId: "sample.deep",
        baselinePassRate: 1,
        candidatePassRate: 0.5,
        passRateDelta: -0.5,
        regressed: true,
      }),
    ]);
  });

  it("fails baseline-candidate verdicts when selected suites lack candidate measurements", () => {
    const plan = loadHarnessGatePlan(root);
    const baseline = measureHarnessGateSamples([
      {
        consumer: "sample",
        suiteId: "sample.smoke",
        tier: "held-in",
        status: "passed",
        durationMs: 100,
      },
      {
        consumer: "sample",
        suiteId: "sample.deep",
        tier: "held-out",
        status: "passed",
        durationMs: 200,
      },
    ]);
    const candidate = measureHarnessGateSamples([
      {
        consumer: "sample",
        suiteId: "sample.smoke",
        tier: "held-in",
        status: "passed",
        durationMs: 100,
      },
    ]);

    const report = formatHarnessGateReport(
      buildHarnessGateVerdict({
        plan,
        triggeredSurfaces: ["codex-hooks"],
        rootDirectory: root,
        baselineMeasurements: baseline,
        candidateMeasurements: candidate,
      }),
    );

    expect(report.ok).toBe(false);
    expect(report.comparisonMode).toBe("baseline-candidate");
    expect(report.coverageFailures).toEqual([
      "missing candidate measurement for sample/sample.deep",
    ]);
    expect(report.summary).toContain("1 coverage failures");
  });

  it("ignores unrelated extra-suite regressions in baseline-candidate files", () => {
    const plan = loadHarnessGatePlan(root);
    const baseline = [
      ...measureHarnessGateSamples([
        {
          consumer: "sample",
          suiteId: "sample.smoke",
          tier: "held-in",
          status: "passed",
          durationMs: 100,
        },
        {
          consumer: "sample",
          suiteId: "sample.deep",
          tier: "held-out",
          status: "passed",
          durationMs: 200,
        },
      ]),
      ...measureHarnessGateSamples([
        {
          consumer: "other",
          suiteId: "other.deep",
          tier: "held-out",
          status: "passed",
          durationMs: 200,
        },
      ]),
    ];
    const candidate = [
      ...measureHarnessGateSamples([
        {
          consumer: "sample",
          suiteId: "sample.smoke",
          tier: "held-in",
          status: "passed",
          durationMs: 100,
        },
        {
          consumer: "sample",
          suiteId: "sample.deep",
          tier: "held-out",
          status: "passed",
          durationMs: 200,
        },
      ]),
      ...measureHarnessGateSamples([
        {
          consumer: "other",
          suiteId: "other.deep",
          tier: "held-out",
          status: "failed",
          durationMs: 200,
        },
      ]),
    ];

    const report = formatHarnessGateReport(
      buildHarnessGateVerdict({
        plan,
        triggeredSurfaces: ["codex-hooks"],
        rootDirectory: root,
        baselineMeasurements: baseline,
        candidateMeasurements: candidate,
      }),
    );

    expect(report.ok).toBe(true);
    expect(report.coverageFailures).toEqual([]);
    expect(report.deltas.map((delta) => delta.suiteId).toSorted()).toEqual([
      "sample.deep",
      "sample.smoke",
    ]);
  });

  it("collects changed files from git for trigger routing", () => {
    const gitRoot = join(root, "git-root");
    mkdirSync(gitRoot, { recursive: true });
    spawnSync("git", ["init"], { cwd: gitRoot });
    spawnSync("git", ["config", "user.email", "agent-kit@example.com"], { cwd: gitRoot });
    spawnSync("git", ["config", "user.name", "Agent Kit"], { cwd: gitRoot });
    writeFileSync(join(gitRoot, "README.md"), "initial\n");
    spawnSync("git", ["add", "README.md"], { cwd: gitRoot });
    spawnSync("git", ["commit", "-m", "initial"], { cwd: gitRoot });
    writeFileSync(join(gitRoot, "README.md"), "changed\n");

    expect(collectChangedFilesFromGit({ rootDirectory: gitRoot, baseRef: "HEAD" })).toEqual([
      "README.md",
    ]);
  });
});
