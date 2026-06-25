import { existsSync, readFileSync, statSync } from "node:fs";
import { availableParallelism } from "node:os";
import { join } from "node:path";
import { globSync } from "glob";

import { getPackageScript, isRecursiveWpScript, packageUsesVitest } from "#cli/package-scripts.js";
import { isRunFailure, runCommand as runSharedCommand } from "#mcp/tools/_shared/run-command";
import { resolveTestSuiteRuns, type TestSuiteName } from "#test";

// Keep the runner's own deadline comfortably below common MCP client call
// ceilings so slow suites fail fast with a structured `timedOut` payload
// instead of appearing to hang.
const DEFAULT_TEST_TIMEOUT_MS = 30_000;
const DEFAULT_TEST_TOTAL_BUDGET_MS = 90_000;
const WORKSPACE_SHARD_MIN_FILES = 6;
const WORKSPACE_TARGET_FILES_PER_SHARD = 5;
const WORKSPACE_MAX_SHARDS = 8;
const WORKSPACE_MAX_DEFAULT_CONCURRENCY = 4;
// Integration/e2e/subprocess tests are small in bytes but expensive at runtime
// (they spawn real git/bun/node); use a fixed high weight so the greedy balancer
// distributes them evenly and they don't pile concurrent subprocesses onto one
// shard. `.subprocess` is the plain-unit-test counterpart of the same hazard.
const INTEGRATION_E2E_SHARD_WEIGHT = 200_000;
const INTEGRATION_E2E_FILE_PATTERN = /\.(integration|e2e|subprocess)\.test\.[jt]sx?$/;
const VITEST_DEFAULT_INCLUDE = "**/*.{test,spec}.?(c|m)[jt]s?(x)";
const VITEST_DEFAULT_IGNORE = [
  "**/node_modules/**",
  "**/dist/**",
  "**/coverage/**",
  "**/.git/**",
  "**/.{idea,cache,output,temp}/**",
  "**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*",
] as const;

export interface TestRunInput {
  /** Working tree to run from. Defaults to `CLAUDE_PROJECT_DIR` or `process.cwd()`. */
  readonly cwd?: string;
  readonly suite?: TestSuiteName;
  readonly packages?: readonly string[];
  readonly files?: readonly string[];
  readonly extraArgs?: readonly string[];
  readonly signal?: AbortSignal;
  readonly timeoutMs?: number;
  readonly workspaceSharding?: WorkspaceShardingInput;
}

export interface TestResult {
  readonly passed: boolean;
  readonly output: string;
  readonly exitCode: number;
  readonly timedOut?: boolean;
  readonly aborted?: boolean;
  readonly failureScope?: string;
}

export interface WorkspaceShardingInput {
  readonly enabled?: boolean;
  readonly minFilesToShard?: number;
  readonly targetFilesPerShard?: number;
  readonly maxShards?: number;
  readonly concurrency?: number;
  readonly totalBudgetMs?: number;
}

interface ResolvedWorkspaceSharding {
  readonly enabled: boolean;
  readonly minFilesToShard: number;
  readonly targetFilesPerShard: number;
  readonly maxShards: number;
  readonly concurrency: number;
  readonly totalBudgetMs: number;
}

/**
 * Run tests via the `vp` facade over the repo-declared package-manager substrate.
 *
 * Argv shape:
 *   - `vp exec --filter <p> -- vitest ...` when `suite` is selected for concrete
 *     Vitest-backed packages.
 *   - `vp run --filter <p> test` once per package when packages are given (results
 *     aggregated; first non-zero exit wins).
 *   - `vp exec -- vitest ...` when `suite` is selected for the workspace.
 *   - `vp run test -- <file1> <file2>` when files are given (no packages).
 *   - `vp run test` otherwise.
 */
export async function runTests(input: TestRunInput): Promise<TestResult> {
  const cwd = input.cwd ?? process.env.CLAUDE_PROJECT_DIR ?? process.cwd();
  const commandTimeoutMs = input.timeoutMs ?? DEFAULT_TEST_TIMEOUT_MS;
  const workspaceSharding = resolveWorkspaceSharding(input.workspaceSharding, input.timeoutMs);
  if (input.packages && input.packages.length > 0) {
    if (input.suite) {
      return runPackageSuiteSequence(cwd, input.packages, input, workspaceSharding);
    }
    return runPackageSequence(cwd, input.packages, input, workspaceSharding);
  }

  if (input.files && input.files.length > 0) {
    if (usesVitest(cwd)) {
      if (input.suite) {
        const suiteFileRuns = createExplicitFileSuiteRuns(
          input.suite,
          ["exec", "--", "vitest"],
          "file-filter",
          input.files,
        );
        if (suiteFileRuns.length === 0) {
          return noMatchingSuiteFiles(input.suite, input.files);
        }
        return runScopedSequence(cwd, suiteFileRuns, input, workspaceSharding);
      }
      const fileShardRuns = createVitestShardRunsFromFiles(cwd, input.files, workspaceSharding);
      if (fileShardRuns && fileShardRuns.length > 0) {
        return runScopedConcurrent(cwd, fileShardRuns, input, workspaceSharding);
      }
      const result = await runCommand(
        "vp",
        ["exec", "--", "vitest", "run", "--reporter=json", "--no-color", ...input.files],
        { ...input, cwd, timeoutMs: commandTimeoutMs },
      );
      return withFailureScope(result, "file-filter command");
    }
    if (input.suite) {
      return unsupportedSuiteFileFilter(input.suite, input.files);
    }
    const result = await runCommand("vp", ["run", "test", "--", ...input.files], {
      ...input,
      cwd,
      timeoutMs: commandTimeoutMs,
    });
    return withFailureScope(result, "file-filter command");
  }

  if (input.suite) {
    const suiteShardRuns = createWorkspaceSuiteShardRuns(cwd, input.suite, workspaceSharding);
    if (suiteShardRuns && suiteShardRuns.length > 0) {
      return runScopedConcurrent(cwd, suiteShardRuns, input, workspaceSharding);
    }
    return runScopedSequence(cwd, createWorkspaceSuiteRuns(input.suite), input, workspaceSharding);
  }

  const workspaceShardRuns = createWorkspaceVitestShardRuns(cwd, workspaceSharding);
  if (workspaceShardRuns && workspaceShardRuns.length > 0) {
    return runScopedConcurrent(cwd, workspaceShardRuns, input, workspaceSharding);
  }

  if (shouldBypassWorkspaceTestScript(cwd)) {
    const result = await runCommand(
      "vp",
      ["exec", "--", "vitest", "run", "--reporter=json", "--no-color"],
      {
        ...input,
        cwd,
        timeoutMs: commandTimeoutMs,
      },
    );
    return withFailureScope(result, "workspace vitest command");
  }

  const result = await runCommand("vp", ["run", "test"], {
    ...input,
    cwd,
    timeoutMs: commandTimeoutMs,
  });
  return withFailureScope(result, "workspace command");
}

interface ScopedRun {
  readonly scope: string;
  readonly args: readonly string[];
}

interface RunBudget {
  readonly deadlineMs: number;
}

async function runPackageSuiteSequence(
  cwd: string,
  packages: readonly string[],
  input: TestRunInput,
  workspaceSharding: ResolvedWorkspaceSharding,
): Promise<TestResult> {
  for (const pkg of packages) {
    assertVitestBackedPackageTarget(cwd, pkg);
  }

  const suiteRuns = packages.flatMap((pkg) => {
    const prefixArgs = ["exec", "--filter", pkg, "--", "vitest"];
    if (input.files && input.files.length > 0) {
      return createExplicitFileSuiteRuns(
        input.suite ?? "all",
        prefixArgs,
        `package ${pkg}`,
        input.files,
      );
    }
    return createVitestScopedRuns(input.suite ?? "all", prefixArgs, `package ${pkg}`);
  });

  if (suiteRuns.length === 0 && input.files && input.files.length > 0) {
    return noMatchingSuiteFiles(input.suite ?? "all", input.files);
  }

  return runScopedSequence(cwd, suiteRuns, input, workspaceSharding);
}

async function runPackageSequence(
  cwd: string,
  packages: readonly string[],
  input: TestRunInput,
  workspaceSharding: ResolvedWorkspaceSharding,
): Promise<TestResult> {
  const budget = createRunBudget(workspaceSharding.totalBudgetMs);
  let combinedOutput = "";
  let firstFailure = 0;
  let timedOut = false;
  let aborted = false;
  let failureScope: string | undefined;
  for (const pkg of packages) {
    const remainingMs = getRemainingBudgetMs(budget);
    if (remainingMs <= 0) {
      timedOut = true;
      if (firstFailure === 0) {
        firstFailure = 124;
        failureScope = "overall test budget";
      }
      combinedOutput += formatScopedOutput(
        "overall test budget",
        `Global test budget exhausted before package ${pkg}.`,
      );
      break;
    }
    const result = await runPackageScopedTests(cwd, pkg, {
      ...input,
      timeoutMs: getScopedCommandTimeoutMs(input, remainingMs),
    });
    combinedOutput += formatScopedOutput(`package ${pkg}`, result.output);
    if (!result.passed && firstFailure === 0) {
      firstFailure = result.exitCode;
      failureScope = `package ${pkg}`;
    }
    if (result.timedOut) timedOut = true;
    if (result.aborted) aborted = true;
    if (result.timedOut || result.aborted) break;
  }
  return {
    passed: firstFailure === 0,
    output: combinedOutput,
    exitCode: firstFailure,
    timedOut,
    aborted,
    failureScope,
  };
}

async function runScopedSequence(
  cwd: string,
  runs: readonly ScopedRun[],
  input: TestRunInput,
  workspaceSharding: ResolvedWorkspaceSharding,
): Promise<TestResult> {
  const budget = createRunBudget(workspaceSharding.totalBudgetMs);
  let combinedOutput = "";
  let firstFailure = 0;
  let timedOut = false;
  let aborted = false;
  let failureScope: string | undefined;
  for (const run of runs) {
    const remainingMs = getRemainingBudgetMs(budget);
    if (remainingMs <= 0) {
      timedOut = true;
      if (firstFailure === 0) {
        firstFailure = 124;
        failureScope = "overall test budget";
      }
      combinedOutput += formatScopedOutput(
        "overall test budget",
        `Global test budget exhausted before ${run.scope}.`,
      );
      break;
    }
    const result = await runCommand("vp", run.args, {
      cwd,
      signal: input.signal,
      timeoutMs: getScopedCommandTimeoutMs(input, remainingMs),
    });
    combinedOutput += formatScopedOutput(run.scope, result.output);
    if (!result.passed && firstFailure === 0) {
      firstFailure = result.exitCode;
      failureScope = run.scope;
    }
    if (result.timedOut) timedOut = true;
    if (result.aborted) aborted = true;
    if (result.timedOut || result.aborted) break;
  }

  return {
    passed: firstFailure === 0,
    output: combinedOutput,
    exitCode: firstFailure,
    timedOut,
    aborted,
    failureScope,
  };
}

async function runScopedConcurrent(
  cwd: string,
  runs: readonly ScopedRun[],
  input: TestRunInput,
  workspaceSharding: ResolvedWorkspaceSharding,
): Promise<TestResult> {
  if (runs.length <= 1 || workspaceSharding.concurrency <= 1) {
    return runScopedSequence(cwd, runs, input, workspaceSharding);
  }

  const budget = createRunBudget(workspaceSharding.totalBudgetMs);
  const results: TestResult[] = [];
  let nextIndex = 0;
  const workerCount = Math.min(workspaceSharding.concurrency, runs.length);

  function claimNextIndex(): number | undefined {
    if (nextIndex >= runs.length) return undefined;
    const remainingMs = getRemainingBudgetMs(budget);
    if (remainingMs > 0) {
      const claimed = nextIndex;
      nextIndex += 1;
      return claimed;
    }

    for (let index = nextIndex; index < runs.length; index += 1) {
      results[index] = {
        passed: false,
        output: `Global test budget exhausted before ${runs[index]!.scope}.`,
        exitCode: 124,
        timedOut: true,
        failureScope: "overall test budget",
      };
    }
    nextIndex = runs.length;
    return undefined;
  }

  async function worker(): Promise<void> {
    while (true) {
      const index = claimNextIndex();
      if (index === undefined) return;
      const run = runs[index]!;
      const remainingMs = getRemainingBudgetMs(budget);
      const result = await runCommand("vp", run.args, {
        cwd,
        signal: input.signal,
        timeoutMs: getScopedCommandTimeoutMs(input, remainingMs),
      });
      results[index] = result;
      if (result.aborted) {
        for (let pending = nextIndex; pending < runs.length; pending += 1) {
          results[pending] = {
            passed: false,
            output: `Test run aborted before ${runs[pending]!.scope}.`,
            exitCode: 130,
            aborted: true,
            failureScope: "client abort",
          };
        }
        nextIndex = runs.length;
      }
    }
  }

  await Promise.all(Array.from({ length: workerCount }, () => worker()));
  return aggregateScopedResults(runs, results);
}

function aggregateScopedResults(
  runs: readonly ScopedRun[],
  results: readonly (TestResult | undefined)[],
): TestResult {
  let combinedOutput = "";
  let firstFailure = 0;
  let timedOut = false;
  let aborted = false;
  let failureScope: string | undefined;

  for (const [index, run] of runs.entries()) {
    const result =
      results[index] ??
      ({
        passed: false,
        output: `Test run did not start for ${run.scope}.`,
        exitCode: 124,
        timedOut: true,
        failureScope: "overall test budget",
      } satisfies TestResult);

    combinedOutput += formatScopedOutput(run.scope, result.output);
    if (!result.passed && firstFailure === 0) {
      firstFailure = result.exitCode;
      failureScope = result.failureScope ?? run.scope;
    }
    if (result.timedOut) timedOut = true;
    if (result.aborted) aborted = true;
  }

  return {
    passed: firstFailure === 0,
    output: combinedOutput,
    exitCode: firstFailure,
    timedOut,
    aborted,
    failureScope,
  };
}

function createRunBudget(totalBudgetMs: number): RunBudget {
  return { deadlineMs: Date.now() + totalBudgetMs };
}

function getRemainingBudgetMs(budget: RunBudget): number {
  return Math.max(0, budget.deadlineMs - Date.now());
}

function getScopedCommandTimeoutMs(input: TestRunInput, remainingMs: number): number {
  return Math.min(input.timeoutMs ?? remainingMs, remainingMs);
}

function resolveWorkspaceSharding(
  input?: WorkspaceShardingInput,
  explicitTimeoutMs?: number,
): ResolvedWorkspaceSharding {
  return {
    enabled: input?.enabled ?? true,
    minFilesToShard: input?.minFilesToShard ?? WORKSPACE_SHARD_MIN_FILES,
    targetFilesPerShard: input?.targetFilesPerShard ?? WORKSPACE_TARGET_FILES_PER_SHARD,
    maxShards: input?.maxShards ?? WORKSPACE_MAX_SHARDS,
    concurrency: resolveShardConcurrency(input),
    totalBudgetMs: input?.totalBudgetMs ?? explicitTimeoutMs ?? DEFAULT_TEST_TOTAL_BUDGET_MS,
  };
}

function resolveShardConcurrency(input?: WorkspaceShardingInput): number {
  if (input?.concurrency !== undefined) return input.concurrency;
  return Math.max(1, Math.min(WORKSPACE_MAX_DEFAULT_CONCURRENCY, availableParallelism()));
}

function formatScopedOutput(scope: string, output: string): string {
  const trimmed = output.trim();
  if (!trimmed) return `[scope: ${scope}]\n`;
  return `[scope: ${scope}]\n${trimmed}\n`;
}

function withFailureScope(result: TestResult, scope: string): TestResult {
  if (result.passed) return result;
  if (result.failureScope) return result;
  return { ...result, failureScope: scope };
}

function createWorkspaceVitestShardRuns(
  cwd: string,
  workspaceSharding: ResolvedWorkspaceSharding,
): ScopedRun[] | undefined {
  if (!workspaceSharding.enabled) return undefined;
  if (!hasRootVitestTestScript(cwd)) return undefined;
  const files = discoverVitestFiles(cwd);
  if (files.length < workspaceSharding.minFilesToShard) return undefined;
  const shards = buildBalancedShards(cwd, files, workspaceSharding);
  const shardTotal = shards.length;
  if (shardTotal <= 1) return undefined;

  return shards.map((filesInShard, index) => ({
    scope: `shard ${index + 1}/${shardTotal} (${filesInShard.length} files)`,
    args: createVitestShardArgs(filesInShard, workspaceSharding, shardTotal),
  }));
}

function createWorkspaceSuiteRuns(suite: TestSuiteName): ScopedRun[] {
  return createVitestScopedRuns(suite, ["exec", "--", "vitest"], "workspace");
}

function createWorkspaceSuiteShardRuns(
  cwd: string,
  suite: TestSuiteName,
  workspaceSharding: ResolvedWorkspaceSharding,
): ScopedRun[] | undefined {
  if (!workspaceSharding.enabled) return undefined;
  if (!hasRootVitestTestScript(cwd)) return undefined;

  const files = discoverVitestFiles(cwd);
  const runs = resolveTestSuiteRuns(suite, ["--reporter=json", "--no-color"]).flatMap(
    (suiteRun) => {
      const suiteFiles = filterFilesForSuite(files, suiteRun.suite);
      if (suiteFiles.length < workspaceSharding.minFilesToShard) {
        return [
          {
            scope: `workspace (${suiteRun.label})`,
            args: ["exec", "--", "vitest", ...suiteRun.vitestArgs],
          },
        ];
      }

      const shards = buildBalancedShards(cwd, suiteFiles, workspaceSharding);
      const shardTotal = shards.length;
      if (shardTotal <= 1) {
        return [
          {
            scope: `workspace (${suiteRun.label})`,
            args: ["exec", "--", "vitest", ...suiteRun.vitestArgs],
          },
        ];
      }

      const suiteArgs =
        suiteRun.suite === "integration" ? ["--no-file-parallelism", "--testTimeout", "30000"] : [];
      return shards.map((filesInShard, index) => ({
        scope: `workspace (${suiteRun.label}) shard ${index + 1}/${shardTotal} (${filesInShard.length} files)`,
        args: createVitestShardArgs(filesInShard, workspaceSharding, shardTotal, suiteArgs),
      }));
    },
  );

  return runs.length > 0 ? runs : undefined;
}

function createVitestShardRunsFromFiles(
  cwd: string,
  files: readonly string[],
  workspaceSharding: ResolvedWorkspaceSharding,
): ScopedRun[] | undefined {
  if (!workspaceSharding.enabled) return undefined;
  if (files.length < workspaceSharding.minFilesToShard) return undefined;
  const shards = buildBalancedShards(cwd, files, workspaceSharding);
  const shardTotal = shards.length;
  if (shardTotal <= 1) return undefined;

  return shards.map((filesInShard, index) => ({
    scope: `file shard ${index + 1}/${shardTotal} (${filesInShard.length} files)`,
    args: createVitestShardArgs(filesInShard, workspaceSharding, shardTotal),
  }));
}

function hasRootVitestTestScript(cwd: string): boolean {
  const packageJson = findPackageJson(cwd);
  if (!packageJson) return false;
  const pkg = readPackage(packageJson);
  const scripts = pkg.scripts;
  if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) return false;
  const testScript = (scripts as Record<string, unknown>).test;
  return typeof testScript === "string" && /\bvitest\b/.test(testScript);
}

function shouldBypassWorkspaceTestScript(cwd: string): boolean {
  const testScript = getPackageScript(cwd, "test");
  if (!testScript || !isRecursiveWpScript(testScript, "test")) return false;
  return packageUsesVitest(cwd);
}

function createVitestScopedRuns(
  suite: TestSuiteName,
  prefixArgs: readonly string[],
  scopePrefix: string,
): ScopedRun[] {
  return resolveTestSuiteRuns(suite, ["--reporter=json", "--no-color"]).map((run) => ({
    scope: `${scopePrefix} (${run.label})`,
    args: [...prefixArgs, ...run.vitestArgs],
  }));
}

function createExplicitFileSuiteRuns(
  suite: TestSuiteName,
  prefixArgs: readonly string[],
  scopePrefix: string,
  files: readonly string[],
): ScopedRun[] {
  return resolveTestSuiteRuns(suite).flatMap((run) => {
    const selectedFiles = filterFilesForSuite(files, run.suite);
    if (selectedFiles.length === 0) return [];
    return [
      {
        scope: `${scopePrefix} (${run.label}, ${selectedFiles.length} file${
          selectedFiles.length === 1 ? "" : "s"
        })`,
        args: [...prefixArgs, ...createExplicitFileSuiteVitestArgs(run.suite), ...selectedFiles],
      },
    ];
  });
}

function createExplicitFileSuiteVitestArgs(
  suite: Exclude<TestSuiteName, "all">,
): readonly string[] {
  if (suite === "integration") {
    return [
      "run",
      "--no-file-parallelism",
      "--testTimeout",
      "30000",
      "--reporter=json",
      "--no-color",
    ];
  }
  return [
    "run",
    "--exclude",
    "**/*.integration.test.ts",
    "--exclude",
    "**/*.e2e.test.ts",
    "--reporter=json",
    "--no-color",
  ];
}

function noMatchingSuiteFiles(suite: TestSuiteName, files: readonly string[]): TestResult {
  return {
    passed: false,
    output: `No explicit file targets matched suite "${suite}". Refusing to expand ${
      files.length
    } file target${files.length === 1 ? "" : "s"} into a broader suite run.`,
    exitCode: 1,
    failureScope: "file-suite filter",
  };
}

function unsupportedSuiteFileFilter(suite: TestSuiteName, files: readonly string[]): TestResult {
  return {
    passed: false,
    output: `Suite "${suite}" cannot be applied to ${files.length} explicit file target${
      files.length === 1 ? "" : "s"
    } because the workspace is not Vitest-backed. Refusing to ignore the suite filter.`,
    exitCode: 1,
    failureScope: "file-suite filter",
  };
}

function discoverVitestFiles(cwd: string): string[] {
  return globSync(VITEST_DEFAULT_INCLUDE, {
    cwd,
    nodir: true,
    ignore: [...VITEST_DEFAULT_IGNORE],
  }).sort((left, right) => left.localeCompare(right));
}

function filterFilesForSuite(
  files: readonly string[],
  suite: Exclude<TestSuiteName, "all">,
): string[] {
  return files.filter((file) =>
    suite === "integration"
      ? INTEGRATION_E2E_FILE_PATTERN.test(file)
      : !INTEGRATION_E2E_FILE_PATTERN.test(file),
  );
}

function createVitestShardArgs(
  filesInShard: readonly string[],
  workspaceSharding: ResolvedWorkspaceSharding,
  shardTotal: number,
  extraArgs: readonly string[] = [],
): readonly string[] {
  return [
    "exec",
    "--",
    "vitest",
    "run",
    "--reporter=json",
    "--no-color",
    ...extraArgs,
    ...createWorkerCapArgs(workspaceSharding, shardTotal),
    ...filesInShard,
  ];
}

function createWorkerCapArgs(
  workspaceSharding: ResolvedWorkspaceSharding,
  shardTotal: number,
): readonly string[] {
  const concurrency = Math.min(workspaceSharding.concurrency, shardTotal);
  if (concurrency <= 1) return [];
  const maxWorkers = Math.max(1, Math.floor(availableParallelism() / concurrency));
  return ["--maxWorkers", String(maxWorkers)];
}

function buildBalancedShards(
  cwd: string,
  files: readonly string[],
  workspaceSharding: ResolvedWorkspaceSharding,
): string[][] {
  const shardCount = Math.min(
    workspaceSharding.maxShards,
    Math.max(2, Math.ceil(files.length / workspaceSharding.targetFilesPerShard)),
  );
  const buckets = Array.from({ length: shardCount }, () => ({ files: [] as string[], bytes: 0 }));
  const sortedByWeight = [...files]
    .map((file) => ({ file, bytes: estimateFileWeight(cwd, file) }))
    .sort((left, right) => {
      if (right.bytes !== left.bytes) return right.bytes - left.bytes;
      return left.file.localeCompare(right.file);
    });

  for (const candidate of sortedByWeight) {
    const lightestBucket = buckets.reduce((best, bucket) =>
      bucket.bytes < best.bytes ? bucket : best,
    );
    lightestBucket.files.push(candidate.file);
    lightestBucket.bytes += candidate.bytes;
  }

  return buckets
    .filter((bucket) => bucket.files.length > 0)
    .map((bucket) => bucket.files.sort((left, right) => left.localeCompare(right)));
}

function estimateFileWeight(cwd: string, file: string): number {
  if (INTEGRATION_E2E_FILE_PATTERN.test(file)) {
    return INTEGRATION_E2E_SHARD_WEIGHT;
  }
  try {
    return Math.max(1, statSync(join(cwd, file)).size);
  } catch {
    return 1;
  }
}

function runPackageScopedTests(
  cwd: string,
  packageName: string,
  input: TestRunInput,
): Promise<TestResult> {
  const files = input.files;
  const options = { cwd, signal: input.signal, timeoutMs: input.timeoutMs };
  if (usesVitest(cwd, packageName)) {
    return runCommand(
      "vp",
      [
        "exec",
        "--filter",
        packageName,
        "--",
        "vitest",
        "run",
        "--reporter=json",
        "--no-color",
        ...(files ?? []),
      ],
      options,
    );
  }

  if (files && files.length > 0) {
    return runCommand("vp", ["run", "--filter", packageName, "test", "--", ...files], options);
  }

  return runCommand("vp", ["run", "--filter", packageName, "test"], options);
}

function usesVitest(cwd: string, packageName?: string): boolean {
  const packageJson = findPackageJson(cwd, packageName);
  if (!packageJson) return false;
  const pkg = readPackage(packageJson);
  const sections = ["dependencies", "devDependencies", "optionalDependencies"] as const;
  return sections.some((section) => {
    const deps = pkg[section];
    return Boolean(deps && typeof deps === "object" && !Array.isArray(deps) && "vitest" in deps);
  });
}

function findPackageJson(cwd: string, packageName?: string): string | undefined {
  const candidates = packageName
    ? [
        join(cwd, "packages", packageName, "package.json"),
        join(cwd, "apps", packageName, "package.json"),
        join(cwd, packageName, "package.json"),
        join(cwd, "package.json"),
      ]
    : [join(cwd, "package.json")];

  return candidates.find((candidate) => existsSync(candidate));
}

function assertVitestBackedPackageTarget(cwd: string, packageTarget: string): void {
  const packageJson = findConcretePackageJson(cwd, packageTarget);
  if (!packageJson) {
    throw new Error(
      `--suite requires a concrete package target. Could not resolve package "${packageTarget}".`,
    );
  }

  const packageDir =
    packageJson === join(cwd, "package.json") ? cwd : packageJson.slice(0, -"/package.json".length);
  if (!packageUsesVitest(packageDir)) {
    throw new Error(
      `--suite requires a Vitest-backed package target. Package "${packageTarget}" does not declare vitest.`,
    );
  }
}

function findConcretePackageJson(cwd: string, packageTarget: string): string | undefined {
  const rootPackage = readPackage(join(cwd, "package.json"));
  const rootPackageName = typeof rootPackage.name === "string" ? rootPackage.name : undefined;
  const candidates = [
    join(cwd, "packages", packageTarget, "package.json"),
    join(cwd, "apps", packageTarget, "package.json"),
    join(cwd, packageTarget, "package.json"),
    ...(rootPackageName === packageTarget ? [join(cwd, "package.json")] : []),
  ];

  return candidates.find((candidate) => existsSync(candidate));
}

function readPackage(file: string): Record<string, unknown> {
  try {
    const value = JSON.parse(readFileSync(file, "utf8")) as unknown;
    if (!value || typeof value !== "object" || Array.isArray(value)) return {};
    return value as Record<string, unknown>;
  } catch {
    return {};
  }
}

async function runCommand(
  cmd: string,
  args: readonly string[],
  options: Pick<TestRunInput, "cwd" | "signal" | "timeoutMs">,
): Promise<TestResult> {
  const outcome = await runSharedCommand(cmd, args, {
    cwd: options.cwd,
    signal: options.signal,
    timeoutMs: options.timeoutMs ?? DEFAULT_TEST_TIMEOUT_MS,
  });
  if (isRunFailure(outcome)) throw outcome.error;
  const output = [outcome.stdout, outcome.stderr].filter(Boolean).join("");
  return {
    passed: outcome.exitCode === 0,
    output,
    exitCode: outcome.exitCode,
    timedOut: outcome.timedOut,
    aborted: outcome.aborted,
  };
}
