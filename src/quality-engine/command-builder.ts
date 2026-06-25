/**
 * Command Builder
 *
 * Pure functions for building lint, typecheck, test, and qa command configurations.
 * These functions return command objects that can be executed by CLI tools.
 *
 * @module
 */

import type { ResolvedTarget } from "./target-resolver.js";

import { getManagedRunner } from "#tool-runtime";
import { extractPackagePath } from "./workspace-config.js";

// =============================================================================
// Command Configuration Types
// =============================================================================

/**
 * Command configuration object.
 * Can be executed by CLI tools using system-commands or similar.
 */
export interface CommandConfig {
  /** Command to execute (e.g., 'pnpm', 'oxlint', 'vitest') */
  command: string;
  /** Command arguments */
  args: string[];
  /** Environment variables */
  env?: Record<string, string>;
}

export type VpRunLogMode = "interleaved" | "labeled" | "grouped";

interface VpRunOptions {
  noCache?: boolean;
  cache?: boolean;
  concurrencyLimit?: number;
  log?: VpRunLogMode;
  parallel?: boolean;
}

/**
 * Convert a CommandConfig to a shell-executable string.
 */
export function commandConfigToString(config: CommandConfig): string {
  return [config.command, ...config.args].join(" ");
}

// =============================================================================
// Lint Command Builder
// =============================================================================

export interface LintOptions {
  fix?: boolean;
  fixUnsafe?: boolean;
}

/**
 * Build oxlint command configuration.
 */
export function buildLintCommand(
  resolved: ResolvedTarget,
  options: LintOptions = {},
): CommandConfig {
  const args: string[] = [];

  // Add paths if any
  if (resolved.value.length > 0) {
    args.push(...resolved.value);
  } else {
    args.push("."); // Default to current directory
  }

  // Add fix flags
  if (options.fix) {
    args.push("--fix");
  }
  if (options.fixUnsafe) {
    args.push("--fix-dangerously");
  }

  return {
    command: "oxlint",
    args,
  };
}

/**
 * Build formatter command configuration through the repo-managed Vite+ facade.
 */
export function buildFormatCommand(resolved: ResolvedTarget): CommandConfig {
  const args: string[] = [];

  // Add paths if any
  if (resolved.value.length > 0) {
    args.push(...resolved.value);
  } else {
    args.push("."); // Default to current directory
  }

  const resolution = getManagedRunner("vp", { outputPolicy: "structured" });
  return {
    command: resolution.command,
    args: [...resolution.args, "fmt", ...args],
  };
}

// =============================================================================
// Typecheck Command Builder
// =============================================================================

export interface TypecheckOptions {
  noCache?: boolean;
  continue?: boolean;
  cache?: boolean;
  concurrencyLimit?: number;
  log?: VpRunLogMode;
  parallel?: boolean;
}

function appendVpRunOptions(args: string[], options: VpRunOptions): void {
  if (options.noCache) {
    args.push("--no-cache");
  } else if (options.cache) {
    args.push("--cache");
  }

  if (options.parallel) {
    args.push("--parallel");
  }

  if (options.concurrencyLimit) {
    args.push("--concurrency-limit", String(options.concurrencyLimit));
  }

  if (options.log) {
    args.push("--log", options.log);
  }
}

function buildVpCommand(args: string[], options: VpRunOptions): CommandConfig {
  const resolution = getManagedRunner("vp");
  return {
    command: resolution.command,
    args: [...resolution.args, ...args],
    env: buildVpRunEnv(options),
  };
}

function buildVpRunEnv(options: VpRunOptions): Record<string, string> | undefined {
  if (!options.concurrencyLimit) {
    return;
  }

  return {
    VP_RUN_CONCURRENCY_LIMIT: String(options.concurrencyLimit),
  };
}

/**
 * Build typecheck command configuration.
 */
export function buildTypecheckCommand(
  resolved: ResolvedTarget,
  repoRoot: string,
  options: TypecheckOptions = {},
): CommandConfig {
  void repoRoot;
  const args = ["run"];

  if (resolved.type === "package" && resolved.value.length > 0) {
    args.push(...resolved.value);
  }

  appendVpRunOptions(args, options);
  args.push("typecheck");

  return buildVpCommand(args, options);
}

/**
 * Convert file paths to package filters for typecheck.
 */
export function filePathsToPackageFilters(
  filePaths: string[],
  repoRoot: string,
  resolveTargetStrict: (target: string, deps: { repoRoot: string }) => ResolvedTarget,
): string[] {
  const seen = new Set<string>();
  const allFilters: string[] = [];

  for (const filePath of filePaths) {
    const packagePath = extractPackagePath(filePath);
    if (!packagePath) continue;

    const packageResolved = resolveTargetStrict(packagePath, { repoRoot });
    if (packageResolved.type === "package") {
      for (const filter of packageResolved.value) {
        if (!seen.has(filter)) {
          seen.add(filter);
          allFilters.push(filter);
        }
      }
    }
  }

  return allFilters;
}

// =============================================================================
// Test Command Builder
// =============================================================================

export interface TestOptions {
  watch?: boolean;
  coverage?: boolean;
  testNamePattern?: string;
  noCache?: boolean;
  continue?: boolean;
  mutation?: boolean;
  workers?: boolean;
  json?: boolean;
  all?: boolean;
  affected?: boolean;
  passthrough?: string[];
  cache?: boolean;
  concurrencyLimit?: number;
  log?: VpRunLogMode;
  parallel?: boolean;
}

/**
 * Get the Vite+ run task name based on test options.
 */
export function getVpTestTask(options: TestOptions): string {
  if (options.mutation) return "test:mutation";
  if (options.workers) return "test:workers";
  if (options.watch) return "test:watch";
  return "test";
}

/**
 * Build Vite+ test command configuration for workspace/package targets.
 */
export function buildVpTestCommand(
  filters: string[],
  options: TestOptions = {},
  useJsonReporter?: boolean,
): CommandConfig {
  const task = getVpTestTask(options);
  const args = ["run", ...filters];
  appendVpRunOptions(args, options);
  args.push(task);

  const extraArgs: string[] = [];
  if (options.coverage) extraArgs.push("--coverage");
  if (options.testNamePattern) extraArgs.push(`-t '${options.testNamePattern}'`);
  if (options.passthrough) extraArgs.push(...options.passthrough);

  if (useJsonReporter) {
    extraArgs.push("--reporter=default");
    extraArgs.push("--reporter=json");
    extraArgs.push("--outputFile=.vite-plus/test-results.json");
  }

  if (extraArgs.length > 0) {
    args.push("--");
    args.push(...extraArgs);
  }

  return buildVpCommand(args, options);
}

/**
 * Build vitest command configuration for file targets.
 */
export function buildVitestCommand(
  files: string[],
  options: TestOptions,
  projectRoot?: string,
): CommandConfig {
  const mode = options.watch ? "--watch" : "run";
  const args = [mode];
  const configFiles: string[] = [];
  const testFiles: string[] = [];

  for (const file of files) {
    if (/^vitest(\.[\w-]+)?\.config\.(ts|mts|cts|js|mjs|cjs)$/.test(file)) {
      configFiles.push(file);
      continue;
    }

    testFiles.push(file);
  }

  // Don't pass --root for file targets — the CWD is already the repo root,
  // and --root can cause filter path mismatches in multi-project setups.
  if (projectRoot && testFiles.length === 0) {
    args.push("--root", projectRoot);
  }

  if (configFiles.length > 1) {
    throw new Error(`Expected at most one vitest config file, received: ${configFiles.join(", ")}`);
  }

  const [configFile] = configFiles;
  if (configFile) {
    args.push("--config", configFile);
  }

  if (options.coverage) {
    args.push("--coverage");
  }

  if (options.testNamePattern) {
    args.push("-t", options.testNamePattern);
  }

  if (options.passthrough?.length) {
    args.push(...options.passthrough);
  }

  // Add file paths directly — buildVitestCommand returns CommandConfig
  // which is spawned directly (not through a shell), so shell escaping
  // would inject literal quote characters into the filename.
  args.push(...testFiles);

  return {
    command: "vitest",
    args,
  };
}

// =============================================================================
// QA Command Builder
// =============================================================================

export type CheckType = "lint" | "typecheck" | "test";
export interface QaOptions {
  quick?: boolean;
  continue?: boolean;
  noCache?: boolean;
  cache?: boolean; // CAC sets cache: false for --no-cache
  concurrencyLimit?: number;
  log?: VpRunLogMode;
}

/**
 * Core package checks (always run).
 */
export const CORE_CHECKS: readonly CheckType[] = ["lint", "typecheck", "test"];

/**
 * Quick checks (subset for --quick mode).
 */
export const QUICK_CHECKS: readonly CheckType[] = ["lint", "typecheck"];

/**
 * Get the list of check types based on options.
 */
export function getCheckTypes(options: QaOptions): readonly CheckType[] {
  return options.quick ? QUICK_CHECKS : CORE_CHECKS;
}

/**
 * Build a combined Vite+ command for package QA.
 */
export function buildCombinedVpCommand(
  checkTypes: readonly CheckType[],
  filters: string[],
  options: QaOptions,
): CommandConfig {
  const packageCheckTypes = checkTypes.filter((t) => t !== "lint");
  const task = packageCheckTypes.includes("test") ? "qa" : "typecheck";
  const args = ["run", ...filters];
  appendVpRunOptions(args, options);
  args.push(task);

  return buildVpCommand(args, options);
}

// =============================================================================
// CAC Input Normalization
// =============================================================================

/**
 * Options as received from CAC (string | string[] for variadic flags).
 */
export interface CacRawOptions {
  package?: string | string[];
  file?: string | string[];
  noCache?: boolean;
  cache?: boolean; // CAC sets cache: false for --no-cache
}

/**
 * Normalized options with arrays and boolean flags resolved.
 */
export interface NormalizedCommandInputs {
  targets: string[];
  options: { package?: string[]; file?: string[]; noCache?: boolean };
}

/**
 * Normalize CAC's raw inputs into consistent arrays.
 *
 * Handles:
 * - `--no-cache` → `noCache: true`
 * - `--package <names...>` as string or string[]
 * - `--file <paths...>` as string or string[]
 * - Positional targets merged into --file or --package when both present
 */
export function normalizeCacInputs(
  targets: string[] | string | undefined,
  rawOptions: CacRawOptions,
): NormalizedCommandInputs {
  let positionalTargets = Array.isArray(targets)
    ? targets
    : typeof targets === "string"
      ? [targets]
      : [];

  // Normalize --no-cache
  const noCache = rawOptions.noCache || rawOptions.cache === false;

  // CAC may pass as string or array - normalize to array
  const packageArr = rawOptions.package
    ? Array.isArray(rawOptions.package)
      ? rawOptions.package
      : [rawOptions.package]
    : undefined;

  const fileArr = rawOptions.file
    ? Array.isArray(rawOptions.file)
      ? rawOptions.file
      : [rawOptions.file]
    : undefined;

  let finalPackage = packageArr;
  let finalFile = fileArr;

  // Merge positional targets into --file or --package when both present
  if (finalFile && positionalTargets.length > 0) {
    finalFile = [...finalFile, ...positionalTargets];
    positionalTargets = [];
  }

  if (finalPackage && positionalTargets.length > 0) {
    finalPackage = [...finalPackage, ...positionalTargets];
    positionalTargets = [];
  }

  return {
    targets: positionalTargets,
    options: {
      package: finalPackage,
      file: finalFile,
      noCache: noCache || undefined,
    },
  };
}
