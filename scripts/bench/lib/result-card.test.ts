import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { listValidBenchmarkResultCards, validateBenchmarkResultCard } from "./result-card";

const REQUIRED_FIELDS = [
  "Command: wp bench session-memory --scenario debug-long-session --variant baseline --trials 2",
  "Git commit: 252f4fcf",
  "Run id: run-native-20260619",
  "Raw run artifact: scripts/bench/runs/run-native-20260619/report.md",
  "Scenario id: debug-long-session",
  "Variant set: baseline",
  "Trial count: 2",
  "Workspace/auth mode: isolated/api-key",
  "Cache-isolation disclaimer: none",
  "Environment: linux-x64 CI",
  "Tool versions: bun 1.2.3, node v24.0.0, claude 1.0.0",
];

function makeRoot(): string {
  const root = mkdtempSync(join(tmpdir(), "wp-result-card-"));
  mkdirSync(join(root, "docs", "bench", "result-cards"), { recursive: true });
  return root;
}

function write(root: string, path: string, text: string): void {
  const full = join(root, path);
  mkdirSync(dirname(full), { recursive: true });
  writeFileSync(full, text, "utf8");
}

function reportRow(metric: string, threshold: string, observed: string, status: string): string {
  return [
    "# Session-memory benchmark",
    "",
    "## Threshold report",
    "",
    "| axis | metric | threshold | observed | status |",
    "| --- | --- | ---: | ---: | --- |",
    `| ${metric} | ${metric.endsWith("recall_at_5") ? "recall_at_5" : "latency_ms"} | ${threshold} | ${observed} | ${status} |`,
    "",
  ].join("\n");
}

describe("benchmark result-card validator", () => {
  let root = "";

  afterEach(() => {
    if (root) rmSync(root, { recursive: true, force: true });
    root = "";
  });

  it("rejects keyword-only result cards that lack contract-required evidence", () => {
    root = makeRoot();
    write(
      root,
      "docs/bench/result-cards/session-memory-bad.md",
      [
        "# Session memory result card",
        "run_id: local-2026-06-19",
        "Raw run artifact: artifacts/session-memory.json",
        "Scenario: restore",
        "Variant: native vs typescript",
        "",
        "| metric | threshold | result |",
        "| --- | --- | --- |",
        "| latency_ms | <=1000 | 42 |",
        "",
        "Environment: CI linux x64",
        "Tool versions: pnpm, cargo",
      ].join("\n"),
    );

    expect(
      validateBenchmarkResultCard("docs/bench/result-cards/session-memory-bad.md", root),
    ).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        "missing Command",
        "missing Git commit",
        "missing Run id",
        "missing Scenario id",
        "missing Variant set",
        "missing Trial count",
        "missing Workspace/auth mode",
        "missing Cache-isolation disclaimer",
        "missing metric table with status column",
        "missing raw artifact artifacts/session-memory.json",
      ]),
    });
  });

  it("accepts a result card with checked-in report-backed threshold evidence", () => {
    root = makeRoot();
    write(
      root,
      "scripts/bench/runs/run-native-20260619/report.md",
      reportRow("search_quality_recall_at_5", "0.8", "0.92", "passed"),
    );
    write(
      root,
      "docs/bench/result-cards/session-memory-native-2026-06-19.md",
      [
        "# Session memory native benchmark result card",
        "",
        "Command: wp bench session-memory --scenario debug-long-session --variant baseline --trials 2",
        "Git commit: 252f4fcf",
        "Run id: run-native-20260619",
        "Raw run artifact: scripts/bench/runs/run-native-20260619/report.md",
        "Scenario id: debug-long-session",
        "Variant set: baseline",
        "Trial count: 2",
        "Workspace/auth mode: isolated/api-key",
        "Cache-isolation disclaimer: none",
        "Environment: linux-x64 CI",
        "Tool versions: bun 1.2.3, node v24.0.0, claude 1.0.0",
        "",
        "| metric | threshold | result | status |",
        "| --- | ---: | ---: | --- |",
        "| search_quality_recall_at_5 | 0.8 | 0.92 | passed |",
      ].join("\n"),
    );

    expect(
      validateBenchmarkResultCard(
        "docs/bench/result-cards/session-memory-native-2026-06-19.md",
        root,
      ),
    ).toMatchObject({
      valid: true,
      errors: [],
    });
    expect(listValidBenchmarkResultCards(root)).toEqual([
      "docs/bench/result-cards/session-memory-native-2026-06-19.md",
    ]);
  });

  it("requires result-card metric claims to match the checked-in raw report", () => {
    root = makeRoot();
    write(
      root,
      "scripts/bench/runs/run-native-20260619/report.md",
      reportRow("search_quality_recall_at_5", "0.8", "0.75", "failed"),
    );
    write(
      root,
      "docs/bench/result-cards/session-memory-native-2026-06-19.md",
      [
        "# Session memory native benchmark result card",
        "",
        "Command: wp bench session-memory --scenario debug-long-session --variant baseline --trials 2",
        "Git commit: 252f4fcf",
        "Run id: run-native-20260619",
        "Raw run artifact: scripts/bench/runs/run-native-20260619/report.md",
        "Scenario id: debug-long-session",
        "Variant set: baseline",
        "Trial count: 2",
        "Workspace/auth mode: isolated/api-key",
        "Cache-isolation disclaimer: none",
        "Environment: linux-x64 CI",
        "Tool versions: bun 1.2.3, node v24.0.0, claude 1.0.0",
        "",
        "| metric | threshold | result | status |",
        "| --- | ---: | ---: | --- |",
        "| search_quality_recall_at_5 | 0.8 | 0.92 | passed |",
      ].join("\n"),
    );

    expect(
      validateBenchmarkResultCard(
        "docs/bench/result-cards/session-memory-native-2026-06-19.md",
        root,
      ),
    ).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        "search_quality_recall_at_5 result 0.92 does not match report observed 0.75",
        "search_quality_recall_at_5 status passed does not match report failed",
      ]),
    });
  });

  it("does not allow hook-latency result-card claims from wall_sec-only reports", () => {
    root = makeRoot();
    write(
      root,
      "scripts/bench/runs/wall-sec-only/report.md",
      [
        "# Session-memory benchmark",
        "",
        "| metric | threshold | result | status |",
        "| --- | ---: | ---: | --- |",
        "| wall_sec | n/a | 0.042 | ok |",
        "| post_tool_capture_latency_ms | 750 | n/a | not-instrumented |",
      ].join("\n"),
    );
    write(
      root,
      "docs/bench/result-cards/wall-sec-only.md",
      [
        "# Wall sec only",
        "",
        "Command: wp bench session-memory --scenario debug-long-session --variant baseline --trials 1",
        "Git commit: 252f4fcf",
        "Run id: wall-sec-only",
        "Raw run artifact: scripts/bench/runs/wall-sec-only/report.md",
        "Scenario id: debug-long-session",
        "Variant set: baseline",
        "Trial count: 1",
        "Workspace/auth mode: isolated/api-key",
        "Cache-isolation disclaimer: none",
        "Environment: linux-x64 CI",
        "Tool versions: bun 1.2.3, node v24.0.0, claude 1.0.0",
        "",
        "| metric | threshold | result | status |",
        "| --- | ---: | ---: | --- |",
        "| post_tool_capture_latency_ms | 750 | 42 | passed |",
      ].join("\n"),
    );

    expect(
      validateBenchmarkResultCard("docs/bench/result-cards/wall-sec-only.md", root),
    ).toMatchObject({
      valid: false,
      errors: expect.arrayContaining([
        "post_tool_capture_latency_ms result 42 does not match report observed n/a",
        "post_tool_capture_latency_ms status passed does not match report not-instrumented",
      ]),
    });
  });

  it("metricClasses includes byte_proxy for approxTokensSaved metric row", () => {
    root = makeRoot();
    write(
      root,
      "scripts/bench/runs/run-native-20260619/report.md",
      [
        "# Session-memory benchmark",
        "",
        "| axis | threshold | observed | status |",
        "| --- | ---: | ---: | --- |",
        "| approxTokensSaved | 1000 | 1234 | passed |",
        "",
      ].join("\n"),
    );
    write(
      root,
      "docs/bench/result-cards/byte-proxy-card.md",
      [
        "# Byte proxy result card",
        "",
        ...REQUIRED_FIELDS,
        "",
        "| metric | threshold | result | status |",
        "| --- | ---: | ---: | --- |",
        "| approxTokensSaved | 1000 | 1234 | passed |",
      ].join("\n"),
    );

    const result = validateBenchmarkResultCard("docs/bench/result-cards/byte-proxy-card.md", root);
    expect(result.metricClasses).toContain("byte_proxy");
  });

  it("metricClasses includes hook_latency for hookLatencyMs metric row", () => {
    root = makeRoot();
    write(
      root,
      "scripts/bench/runs/run-native-20260619/report.md",
      [
        "# Session-memory benchmark",
        "",
        "| axis | threshold | observed | status |",
        "| --- | ---: | ---: | --- |",
        "| hookLatencyMs | 750 | 120 | passed |",
        "",
      ].join("\n"),
    );
    write(
      root,
      "docs/bench/result-cards/hook-latency-card.md",
      [
        "# Hook latency result card",
        "",
        ...REQUIRED_FIELDS,
        "",
        "| metric | threshold | result | status |",
        "| --- | ---: | ---: | --- |",
        "| hookLatencyMs | 750 | 120 | passed |",
      ].join("\n"),
    );

    const result = validateBenchmarkResultCard(
      "docs/bench/result-cards/hook-latency-card.md",
      root,
    );
    expect(result.metricClasses).toContain("hook_latency");
  });

  it("byte_proxy and provider_tokens_cost are different classes", () => {
    root = makeRoot();
    write(
      root,
      "scripts/bench/runs/run-native-20260619/report.md",
      [
        "# Session-memory benchmark",
        "",
        "| axis | threshold | observed | status |",
        "| --- | ---: | ---: | --- |",
        "| approxTokensSaved | 1000 | 1234 | passed |",
        "| tokensSaved | 90 | 99 | passed |",
        "",
      ].join("\n"),
    );
    write(
      root,
      "docs/bench/result-cards/mixed-class-card.md",
      [
        "# Mixed class result card",
        "",
        ...REQUIRED_FIELDS,
        "",
        "| metric | threshold | result | status |",
        "| --- | ---: | ---: | --- |",
        "| approxTokensSaved | 1000 | 1234 | passed |",
        "| tokensSaved | 90 | 99 | passed |",
      ].join("\n"),
    );

    const result = validateBenchmarkResultCard("docs/bench/result-cards/mixed-class-card.md", root);
    expect(result.metricClasses).toContain("byte_proxy");
    expect(result.metricClasses).toContain("provider_tokens_cost");
    expect("byte_proxy").not.toStrictEqual("provider_tokens_cost");
  });
});
