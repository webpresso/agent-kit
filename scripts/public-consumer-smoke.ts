#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { syncBlueprintMigrationSqlAssets } from "../src/build/blueprint-migration-assets.js";
import { preparePackedManifest, restorePackedManifest } from "../src/build/package-manifest.js";
import { AGENTS_MD_MAX_BYTES } from "../src/cli/commands/init/scaffold-agents-md.js";
import { createInstalledBlueprintMigrationSmokeScript } from "./packed-blueprint-migration-smoke.js";
import {
  computeOverallStatus,
  summarizePhases,
  type PhaseResult,
  type PhaseStatus,
  type PhaseSummary,
} from "./public-consumer-smoke-phases.js";
import { formatPhaseProgressLine } from "./public-consumer-smoke-progress.js";

export type { PhaseResult, PhaseStatus, PhaseSummary };
export { computeOverallStatus, summarizePhases };

const SHARED_FAVORITES = ["fix", "verify", "testing-philosophy", "plan-refine", "pll"] as const;

const DEFAULT_ABSENT_SKILLS = [
  "systematic-debugging",
  "test-driven-development",
  "deep-research",
  "monorepo-navigation",
] as const;

interface RunResult {
  readonly command: string;
  readonly ok: boolean;
  readonly detail: string;
}

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(SCRIPT_DIR, "..");
const setupOnly = process.argv.includes("--setup-only");
const keep = process.argv.includes("--keep");
const includeMutation = process.argv.includes("--include-mutation");
const skipBuild = process.argv.includes("--skip-build");
const DEFAULT_PHASE_TIMEOUT_MS = 5 * 60 * 1000;
const RUN_RESULT_DETAIL_MAX_CHARS = 8_000;
// Cold packed-install setup includes `npm exec --package <tarball>` dependency
// resolution before `wp setup` starts scaffolding. A measured success run on
// 2026-06-26 took ~7m10s wall time (429_719ms), while the old 5 minute bound
// killed the same proof at ~321_721ms. Keep the longer budget scoped to the
// explicit packed-install setup phase only.
const SETUP_PHASE_TIMEOUT_MS = 8 * 60 * 1000;
const PACK_TIMEOUT_MS = 2 * 60 * 1000;
const TARBALL_CONTRACT_TIMEOUT_MS = 30_000;

const requiredFiles = [
  "tsconfig.json",
  "vitest.config.ts",
  "stryker.config.ts",
  "playwright.config.ts",
  "src/quality-sample.ts",
  "src/quality-sample.test.ts",
  "e2e/fixtures/smoke.html",
  "e2e/smoke.spec.ts",
] as const;
const expectedBlueprintMigrationSqlFiles = readdirSync(
  join(ROOT, "src", "blueprint", "db", "migrations"),
)
  .filter((file) => file.endsWith(".sql"))
  .sort();
const expectedBlueprintSchemaVersions = expectedBlueprintMigrationSqlFiles.map((file) =>
  Number.parseInt(file.slice(0, file.indexOf("_")), 10),
);

function logPhaseStart(phase: string, detail?: string): void {
  console.log(formatPhaseProgressLine(phase, "start", detail));
}

function logPhaseFinish(result: PhaseResult): void {
  console.log(
    formatPhaseProgressLine(result.phase, "finish", `${result.status} (${result.durationMs}ms)`),
  );
}

function run(
  command: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
  timeoutMs = DEFAULT_PHASE_TIMEOUT_MS,
): RunResult {
  try {
    execFileSync(command, [...args], {
      cwd,
      env,
      encoding: "utf8",
      timeout: timeoutMs,
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { command: [command, ...args].join(" "), ok: true, detail: "ok" };
  } catch (error) {
    const failed = error as { status?: number; stdout?: string; stderr?: string };
    const output = `${failed.stdout ?? ""}${failed.stderr ?? ""}`.trim();
    return {
      command: [command, ...args].join(" "),
      ok: false,
      detail: `exit ${failed.status ?? 1}${output ? `: ${output.slice(0, RUN_RESULT_DETAIL_MAX_CHARS)}` : ""}`,
    };
  }
}

function runOrThrow(
  command: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv = process.env,
  timeoutMs = DEFAULT_PHASE_TIMEOUT_MS,
): string {
  return execFileSync(command, [...args], {
    cwd,
    env,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
    timeout: timeoutMs,
    killSignal: "SIGTERM",
  });
}

function ensurePackableNativeRuntime(): RunResult[] {
  return [
    run("bun", ["scripts/build-runtime-binaries.ts"], ROOT),
    run("bun", ["scripts/stage-plugin-runtime-artifacts.ts"], ROOT),
    run("bun", ["scripts/build-session-memory-native-artifacts.ts", "--target", "host"], ROOT),
    run("bun", ["scripts/stage-session-memory-native-artifacts.ts", "--target", "host"], ROOT),
  ];
}

function packCurrentArtifact(tempRoot: string): string {
  let raw: string;
  try {
    syncBlueprintMigrationSqlAssets(ROOT);
    preparePackedManifest(ROOT);
    // --pack-destination writes the tarball into the temp workspace (removed on
    // exit) instead of the repo root, so a parallel run can't race on the fixed
    // root path and a crashed pack can't leave an untracked tarball behind.
    raw = runOrThrow(
      "npm",
      ["pack", "--ignore-scripts", "--json", "--pack-destination", tempRoot],
      ROOT,
      process.env,
      PACK_TIMEOUT_MS,
    );
  } finally {
    restorePackedManifest(ROOT);
  }
  const parsed = JSON.parse(raw.match(/\[.*\]/s)?.[0] ?? "[]") as Array<{ filename?: string }>;
  const filename = parsed[0]?.filename;
  if (!filename) {
    throw new Error("npm pack did not report a filename");
  }
  return join(tempRoot, filename);
}

function assertSetupContract(repo: string): RunResult[] {
  const results: RunResult[] = [];
  for (const file of requiredFiles) {
    const target = join(repo, file);
    results.push({
      command: `assert exists ${file}`,
      ok: existsSync(target),
      detail: existsSync(target) ? "ok" : "missing",
    });
  }

  const pkg = JSON.parse(readFileSync(join(repo, "package.json"), "utf8")) as {
    scripts?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  for (const script of ["lint", "typecheck", "test", "mutation", "test:mutation", "e2e", "qa"]) {
    results.push({
      command: `assert package script ${script}`,
      ok: typeof pkg.scripts?.[script] === "string",
      detail: pkg.scripts?.[script] ?? "missing",
    });
  }
  for (const dep of [
    "@webpresso/agent-config",
    "typescript",
    "vitest",
    "@playwright/test",
    "@stryker-mutator/core",
    "@stryker-mutator/vitest-runner",
  ]) {
    results.push({
      command: `assert authoring dependency ${dep}`,
      ok: typeof pkg.devDependencies?.[dep] === "string",
      detail: pkg.devDependencies?.[dep] ?? "missing",
    });
  }

  for (const hostRoot of [".agents/skills", ".claude/skills"] as const) {
    for (const skill of SHARED_FAVORITES) {
      const target = join(repo, hostRoot, skill, "SKILL.md");
      results.push({
        command: `assert shared favorite ${hostRoot}/${skill}`,
        ok: existsSync(target),
        detail: existsSync(target) ? "ok" : "missing",
      });
    }

    for (const skill of DEFAULT_ABSENT_SKILLS) {
      const target = join(repo, hostRoot, skill, "SKILL.md");
      results.push({
        command: `assert default absent ${hostRoot}/${skill}`,
        ok: !existsSync(target),
        detail: existsSync(target) ? "unexpectedly present" : "ok",
      });
    }
  }

  const agentsPath = join(repo, "AGENTS.md");
  const agentsBytes = existsSync(agentsPath)
    ? Buffer.byteLength(readFileSync(agentsPath), "utf8")
    : 0;
  results.push({
    command: "assert AGENTS.md prompt budget",
    ok: agentsBytes <= AGENTS_MD_MAX_BYTES,
    detail: existsSync(agentsPath) ? `${agentsBytes}/${AGENTS_MD_MAX_BYTES} bytes` : "missing",
  });

  return results;
}

function pinPackedAgentKitDependency(repo: string, tarballPath: string): void {
  const packageJsonPath = join(repo, "package.json");
  const pkg = JSON.parse(readFileSync(packageJsonPath, "utf8")) as {
    devDependencies?: Record<string, string>;
  };
  pkg.devDependencies ??= {};
  pkg.devDependencies["@webpresso/agent-kit"] = `file:${tarballPath}`;
  writeFileSync(packageJsonPath, `${JSON.stringify(pkg, null, 2)}\n`);
}

function assertPackedSessionMemoryNativeContract(tarballPath: string): RunResult[] {
  let entries: string[];
  try {
    entries = execFileSync("tar", ["-tf", tarballPath], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
      timeout: TARBALL_CONTRACT_TIMEOUT_MS,
      killSignal: "SIGTERM",
    })
      .split("\n")
      .filter(Boolean)
      .map((entry) => entry.replace(/^package\//u, ""));
  } catch (error) {
    const failed = error as { status?: number; stdout?: string; stderr?: string };
    const output = `${failed.stdout ?? ""}${failed.stderr ?? ""}`.trim();
    return [
      {
        command: "assert packed session-memory tarball contract",
        ok: false,
        detail: `tar exit ${failed.status ?? 1}${output ? `: ${output.slice(0, RUN_RESULT_DETAIL_MAX_CHARS)}` : ""}`,
      },
    ];
  }

  const leakedRustSource = entries.filter(
    (entry) =>
      entry.startsWith("native/session-memory-engine/") ||
      entry === "Cargo.toml" ||
      entry.endsWith("/Cargo.toml") ||
      entry.endsWith("/Cargo.lock"),
  );
  return [
    {
      command: "assert packed session-memory native loader exists",
      ok: entries.includes("dist/esm/session-memory/native-runtime.js"),
      detail: entries.includes("dist/esm/session-memory/native-runtime.js")
        ? "ok"
        : "missing dist/esm/session-memory/native-runtime.js",
    },
    {
      command: "assert packed session-memory Rust source absent",
      ok: leakedRustSource.length === 0,
      detail: leakedRustSource.length === 0 ? "ok" : leakedRustSource.join(", "),
    },
  ];
}

function runResultsToPhaseResult(
  phase: string,
  startMs: number,
  runResults: readonly RunResult[],
): PhaseResult {
  const failed = runResults.filter((r) => !r.ok);
  const output = runResults
    .map((r) => `[${r.ok ? "PASS" : "FAIL"}] ${r.command}: ${r.detail}`)
    .join("\n")
    .slice(0, RUN_RESULT_DETAIL_MAX_CHARS);
  return {
    phase,
    status: failed.length === 0 ? "PASS" : "FAIL",
    durationMs: Date.now() - startMs,
    capturedOutput: output,
  };
}

function runSingleToPhaseResult(phase: string, startMs: number, result: RunResult): PhaseResult {
  return {
    phase,
    status: result.ok ? "PASS" : "FAIL",
    durationMs: Date.now() - startMs,
    capturedOutput: `[${result.ok ? "PASS" : "FAIL"}] ${result.command}: ${result.detail}`.slice(
      0,
      RUN_RESULT_DETAIL_MAX_CHARS,
    ),
  };
}

function formatSummary(summary: PhaseSummary): string {
  const lines: string[] = [`Public consumer smoke: ${summary.overall}`];
  for (const p of summary.phases) {
    lines.push(`[${p.status}] ${p.phase} (${p.durationMs}ms)`);
    if (p.capturedOutput) lines.push(p.capturedOutput);
    if (p.blockReason) lines.push(`  blocked: ${p.blockReason}`);
  }
  return lines.join("\n");
}

const tempRoot = mkdtempSync(join(tmpdir(), "wp-public-consumer-smoke-"));
const repo = join(tempRoot, "repo");
const home = join(tempRoot, "home");
let tarball = "";
const phaseResults: PhaseResult[] = [];

try {
  // Phase: build
  if (!skipBuild) {
    const t = Date.now();
    logPhaseStart("build", "vp run build");
    const buildResult = run("vp", ["run", "build"], ROOT);
    const buildPhaseResult = runSingleToPhaseResult("build", t, buildResult);
    phaseResults.push(buildPhaseResult);
    logPhaseFinish(buildPhaseResult);
    if (!buildResult.ok) {
      console.log(formatSummary(summarizePhases(phaseResults)));
      if (!keep) rmSync(tempRoot, { recursive: true, force: true });
      process.exit(1);
    }
  }

  // Phase: native-stage
  {
    const t = Date.now();
    logPhaseStart("native-stage", "stage runtime and session-memory artifacts");
    const nativeResults = ensurePackableNativeRuntime();
    const nativePhaseResult = runResultsToPhaseResult("native-stage", t, nativeResults);
    phaseResults.push(nativePhaseResult);
    logPhaseFinish(nativePhaseResult);
    if (nativeResults.some((r) => !r.ok)) {
      console.log(formatSummary(summarizePhases(phaseResults)));
      if (!keep) rmSync(tempRoot, { recursive: true, force: true });
      process.exit(1);
    }
  }

  // Phase: pack
  {
    const t = Date.now();
    try {
      logPhaseStart("pack", "npm pack --ignore-scripts --json");
      tarball = packCurrentArtifact(tempRoot);
      const packPhaseResult = {
        phase: "pack",
        status: "PASS",
        durationMs: Date.now() - t,
        capturedOutput: `packed: ${tarball}`.slice(0, RUN_RESULT_DETAIL_MAX_CHARS),
      } satisfies PhaseResult;
      phaseResults.push(packPhaseResult);
      logPhaseFinish(packPhaseResult);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const packPhaseResult = {
        phase: "pack",
        status: "FAIL",
        durationMs: Date.now() - t,
        capturedOutput: msg.slice(0, RUN_RESULT_DETAIL_MAX_CHARS),
      } satisfies PhaseResult;
      phaseResults.push(packPhaseResult);
      logPhaseFinish(packPhaseResult);
      console.log(formatSummary(summarizePhases(phaseResults)));
      if (!keep) rmSync(tempRoot, { recursive: true, force: true });
      process.exit(1);
    }
  }

  // Phase: tarball-contract
  {
    const t = Date.now();
    logPhaseStart("tarball-contract", "inspect packed tarball contents");
    const contractResults = assertPackedSessionMemoryNativeContract(tarball);
    const contractPhaseResult = runResultsToPhaseResult("tarball-contract", t, contractResults);
    phaseResults.push(contractPhaseResult);
    logPhaseFinish(contractPhaseResult);
  }

  // Phase: setup
  {
    const t = Date.now();
    logPhaseStart("setup", "npm exec --package <tarball> -- wp setup --project-init --host all");
    const initGit = run("git", ["init", repo], tempRoot);
    const initNpm = run("npm", ["init", "--yes"], repo);
    const setupEnv = {
      ...process.env,
      CI: "true",
      HOME: home,
      WP_SKIP_AUTO_INSTALL: "1",
      WP_SKIP_CLAUDE_PLUGIN: "1",
      WP_SKIP_CODEX_PLUGIN: "1",
      WP_SKIP_RTK: "1",
      WP_SKIP_UPDATE_CHECK: "1",
    };
    const setupResult = run(
      "npm",
      [
        "exec",
        "--yes",
        "--package",
        tarball,
        "--",
        "wp",
        "setup",
        "--yes",
        "--project-init",
        "--host",
        "all",
      ],
      repo,
      setupEnv,
      SETUP_PHASE_TIMEOUT_MS,
    );
    const setupPhaseResult = runResultsToPhaseResult("setup", t, [initGit, initNpm, setupResult]);
    phaseResults.push(setupPhaseResult);
    logPhaseFinish(setupPhaseResult);

    // Phase: setup-contract
    const tContract = Date.now();
    logPhaseStart("setup-contract", "verify fresh consumer scaffold and authoring deps");
    const setupContractResults = assertSetupContract(repo);
    const setupContractPhaseResult = runResultsToPhaseResult(
      "setup-contract",
      tContract,
      setupContractResults,
    );
    phaseResults.push(setupContractPhaseResult);
    logPhaseFinish(setupContractPhaseResult);

    if (!setupOnly) {
      pinPackedAgentKitDependency(repo, tarball);

      // Phase: install
      const tInstall = Date.now();
      logPhaseStart("install", "npm install in packed consumer");
      const install = run("npm", ["install"], repo, setupEnv, 10 * 60 * 1000);
      const installPhaseResult = runSingleToPhaseResult("install", tInstall, install);
      phaseResults.push(installPhaseResult);
      logPhaseFinish(installPhaseResult);

      if (install.ok) {
        // Phase: consume
        const tConsume = Date.now();
        logPhaseStart("consume", "run scaffolded consumer quality checks");
        const consumeResults: RunResult[] = [];
        consumeResults.push(
          run(
            "node",
            [
              "--input-type=module",
              "--eval",
              createInstalledBlueprintMigrationSmokeScript({
                packageRoot: join(repo, "node_modules", "@webpresso", "agent-kit"),
                expectedSqlFiles: expectedBlueprintMigrationSqlFiles,
                expectedVersions: expectedBlueprintSchemaVersions,
              }),
            ],
            repo,
            setupEnv,
          ),
        );
        consumeResults.push(run("npm", ["run", "lint"], repo, setupEnv));
        consumeResults.push(run("npm", ["run", "typecheck"], repo, setupEnv));
        consumeResults.push(run("npm", ["run", "test"], repo, setupEnv));
        if (includeMutation) {
          consumeResults.push(run("npm", ["run", "mutation"], repo, setupEnv, 10 * 60 * 1000));
        }
        consumeResults.push(run("npm", ["run", "e2e"], repo, setupEnv));
        consumeResults.push(run("npm", ["run", "qa"], repo, setupEnv));
        const consumePhaseResult = runResultsToPhaseResult("consume", tConsume, consumeResults);
        phaseResults.push(consumePhaseResult);
        logPhaseFinish(consumePhaseResult);
      }
    }
  }
} finally {
  if (tarball && !keep) rmSync(tarball, { force: true });
  if (!keep) rmSync(tempRoot, { recursive: true, force: true });
}

const summary = summarizePhases(phaseResults);
console.log(formatSummary(summary));

if (summary.overall === "FAIL") {
  if (keep) console.log(`Kept smoke workspace: ${tempRoot}`);
  process.exit(1);
}
