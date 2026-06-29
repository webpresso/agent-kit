import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import { type MergeOptions, type MergeResult, writeFileMerged } from "./merge.js";
import { readPackageVersion } from "#cli/utils";

export interface ScaffoldBaseKitInput {
  catalogDir: string;
  repoRoot: string;
  options: MergeOptions;
}

export interface RuntimeContractGuidance {
  keepLocalAuthoringDeps: string[];
  reviewForRemovalDeps: string[];
}

interface PackageJsonLike {
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  [key: string]: unknown;
}

const AUTHORING_TIME_DEPENDENCIES = [
  "@changesets/cli",
  "vitest",
  "@playwright/test",
  "@testing-library/jest-dom",
  "typescript",
] as const;

const EXECUTION_ONLY_REVIEW_DEPENDENCIES = [
  "oxlint",
  "oxfmt",
  "prettier",
  "markdownlint-cli2",
  "stryker",
] as const;

const DEFAULT_AGENT_CONFIG_RANGE = `^${readAgentConfigVersion(import.meta.url)}`;

export function readAgentConfigVersion(metaUrl: string): string {
  const packageVersion = readPackageVersion(metaUrl);
  let current = dirname(new URL(metaUrl).pathname);

  for (let depth = 0; depth < 12; depth += 1) {
    const packagePath = join(current, "package.json");
    if (existsSync(packagePath)) {
      try {
        const pkg = JSON.parse(readFileSync(packagePath, "utf8")) as {
          name?: unknown;
          webpresso?: { agentConfigVersion?: unknown };
        };
        if (pkg.name === "@webpresso/agent-kit") {
          const packagedVersion = pkg.webpresso?.agentConfigVersion;
          if (typeof packagedVersion === "string" && packagedVersion.length > 0) {
            return packagedVersion;
          }

          const sourcePackagePath = join(current, "packages", "agent-config", "package.json");
          if (existsSync(sourcePackagePath)) {
            const sourcePkg = JSON.parse(readFileSync(sourcePackagePath, "utf8")) as {
              version?: unknown;
            };
            if (typeof sourcePkg.version === "string" && sourcePkg.version.length > 0) {
              return sourcePkg.version;
            }
          }
        }
      } catch {
        // Keep walking: unrelated parent/package fixture directories can be
        // malformed, but they must not make us pin agent-config to the
        // agent-kit package version.
      }
    }
    const parent = dirname(current);
    if (parent === current) break;
    current = parent;
  }

  return packageVersion;
}

export function collectRuntimeContractGuidance(
  packageJson: PackageJsonLike | null | undefined,
): RuntimeContractGuidance {
  const deps = {
    ...readDependencyBucket(packageJson?.["dependencies"]),
    ...readDependencyBucket(packageJson?.["devDependencies"]),
  };
  const installed = new Set(Object.keys(deps));

  return {
    keepLocalAuthoringDeps: AUTHORING_TIME_DEPENDENCIES.filter((name) => installed.has(name)),
    reviewForRemovalDeps: EXECUTION_ONLY_REVIEW_DEPENDENCIES.filter((name) => installed.has(name)),
  };
}

/** Template files relative to `catalog/base-kit/`, and their target paths relative to repoRoot. */
const TEMPLATE_MAP: Array<[string, string]> = [
  [".editorconfig.tmpl", ".editorconfig"],
  [".secretlintrc.json.tmpl", ".secretlintrc.json"],
  [".actrc.tmpl", ".actrc"],
  [".changeset/config.json.tmpl", ".changeset/config.json"],
  [".changeset/README.md.tmpl", ".changeset/README.md"],
  ["commitlint.config.ts.tmpl", "commitlint.config.ts"],
  ["scripts/sync-release-metadata-version.ts.tmpl", "scripts/sync-release-metadata-version.ts"],
  ["scripts/release-publish.ts.tmpl", "scripts/release-publish.ts"],
  [".husky/pre-commit.tmpl", ".husky/pre-commit"],
  [".github/workflows/ci.yml.tmpl", ".github/workflows/ci.yml"],
  [".github/workflows/release.yml.tmpl", ".github/workflows/release.yml"],
  ["test/.gitkeep.tmpl", "test/.gitkeep"],
  ["e2e/.gitkeep.tmpl", "e2e/.gitkeep"],
];

/** Consumer-owned quality scaffold: create for fresh repos, never clobber. */
const QUALITY_BOOTSTRAP_ONLY_MAP: Array<[string, string]> = [
  ["tsconfig.json.tmpl", "tsconfig.json"],
  ["vitest.config.ts.tmpl", "vitest.config.ts"],
  // No oxlint.config.ts: `wp lint` injects agent-kit's shared --config so
  // consumers need zero local oxlint config (Tier-1 DRY). A consumer may still
  // commit its own oxlint.config.ts to override — `wp lint` then defers to it.
  ["stryker.config.ts.tmpl", "stryker.config.ts"],
  ["playwright.config.ts.tmpl", "playwright.config.ts"],
  ["src/quality-sample.ts.tmpl", "src/quality-sample.ts"],
  ["src/quality-sample.test.ts.tmpl", "src/quality-sample.test.ts"],
  ["e2e/fixtures/smoke.html.tmpl", "e2e/fixtures/smoke.html"],
  ["e2e/smoke.spec.ts.tmpl", "e2e/smoke.spec.ts"],
];

export const BASE_KIT_QUALITY_TARGETS = QUALITY_BOOTSTRAP_ONLY_MAP.map(
  ([, targetRel]) => targetRel,
);

/**
 * Bootstrap-only templates: the scaffolder writes them when absent (so a
 * fresh repo gets sane defaults) but NEVER overwrites them once they exist
 * — even under `--overwrite`. These files are consumer-owned and grow with
 * project-specific content (catalog entries, ignore patterns) that the
 * generic template can't reproduce. Clobbering them on every `wp setup`
 * deletes that content silently, breaks `vp install`, and pollutes git
 * status with thousands of newly-tracked artifacts.
 *
 * Verified failure mode (large multi-package workspace, 2026-05-07): the postinstall
 * `wp setup repair --overwrite` reduced pnpm-workspace.yaml from 221 lines (full
 * catalog) to 34 lines (generic template), removing catalog entries
 * referenced by `pnpm.overrides` and
 * making subsequent `vp install` fail with ERR_PNPM_CATALOG_IN_OVERRIDES.
 * The same overwrite stripped workspace-specific .gitignore rules
 * (.test-reports/, generated outputs, worker-state directories, etc.),
 * unmasking 23k+ generated artifacts to git status.
 */
const BOOTSTRAP_ONLY_MAP: Array<[string, string]> = [
  [".gitignore.tmpl", ".gitignore"],
  ["pnpm-workspace.yaml.tmpl", "pnpm-workspace.yaml"],
];

/** Merge `engines` and `packageManager` into the consumer repo's package.json. */
function mergePackageJson(repoRoot: string, options: MergeOptions): MergeResult {
  const pkgPath = join(repoRoot, "package.json");
  const engines = { node: ">=24" };
  const packageManager = "pnpm@11.1.1";

  if (options.dryRun) {
    return { targetPath: pkgPath, action: "skipped-dry" };
  }

  let pkg: Record<string, unknown> = {};
  if (existsSync(pkgPath)) {
    try {
      pkg = JSON.parse(readFileSync(pkgPath, "utf8")) as Record<string, unknown>;
    } catch {
      // malformed — leave untouched
      return { targetPath: pkgPath, action: "identical" };
    }
  } else {
    pkg = { name: "my-app", version: "0.0.0", private: true, type: "module" };
  }

  const existing = pkg["engines"] as Record<string, string> | undefined;
  const alreadyHasEngines = existing?.node === engines.node;
  // Don't downgrade: treat any pnpm@11+ as already-satisfied so wp setup
  // does not regress repos that have already been migrated to v11.
  const existingPm = pkg["packageManager"];
  const alreadyHasPm =
    existingPm === packageManager ||
    (typeof existingPm === "string" && /^pnpm@1[1-9]\./.test(existingPm));
  const packageName = typeof pkg["name"] === "string" ? pkg["name"] : undefined;

  const scripts = (pkg["scripts"] ?? {}) as Record<string, string>;
  const hasSetupAgent = typeof scripts["setup:agent"] === "string";
  const hasVerifyPaths = typeof scripts["verify:paths"] === "string";
  const hasVerifySecrets = typeof scripts["verify:secrets"] === "string";
  const hasSecretQuarantineAudit = typeof scripts["audit:secret-provider-quarantine"] === "string";
  const hasPrepareScript = typeof scripts["prepare"] === "string";
  const hasLintScript = typeof scripts["lint"] === "string";
  const hasTypecheckScript = typeof scripts["typecheck"] === "string";
  const hasTestScript =
    typeof scripts["test"] === "string" && !isNpmInitPlaceholderTestScript(scripts["test"]);
  const hasChangesetScript = typeof scripts["changeset"] === "string";
  const hasChangesetStatusScript = typeof scripts["changeset:status"] === "string";
  const hasVersionScript = typeof scripts["version"] === "string";
  const hasReleasePublishScript = typeof scripts["release:publish"] === "string";
  const hasMutationScript = typeof scripts["mutation"] === "string";
  const hasTestMutationScript = typeof scripts["test:mutation"] === "string";
  const hasE2eScript = typeof scripts["e2e"] === "string";
  const hasQaScript = typeof scripts["qa"] === "string";
  const verifyPathsScript = "wp audit absolute-path-policy --root .";
  const verifySecretsScript = "wp audit no-dev-vars";
  const secretQuarantineAuditScript = "wp audit secret-provider-quarantine";
  const lintScript = "wp lint --file src --file e2e --file *.config.ts";
  const typecheckScript = "wp typecheck";
  const testScript = "wp test --file vitest.config.ts";
  const changesetScript = "changeset";
  const changesetStatusScript = "changeset status";
  const versionScript = "changeset version && bun scripts/sync-release-metadata-version.ts";
  const releasePublishScript = "bun scripts/release-publish.ts";
  const mutationScript = "wp test --mutation";
  const testMutationScript = "stryker run stryker.config.ts";
  const e2eScript = "wp e2e --config playwright.config.ts";
  const qaScript = [
    "wp lint --file src --file e2e --file *.config.ts",
    "wp typecheck",
    "wp test --file vitest.config.ts",
    "wp test --mutation",
    "wp e2e --config playwright.config.ts",
  ].join(" && ");

  const devDeps = (pkg["devDependencies"] ?? {}) as Record<string, string>;
  const hasAgentConfigDevDep = typeof devDeps["@webpresso/agent-config"] === "string";
  const shouldSkipSelfInstall = isSelfPackageName(packageName);
  const requiredAuthoringDeps: Record<string, string> = {
    "@changesets/cli": "latest",
    "@playwright/test": "latest",
    "@stryker-mutator/core": "latest",
    "@stryker-mutator/typescript-checker": "latest",
    "@stryker-mutator/vitest-runner": "latest",
    "@types/node": "latest",
    typescript: "latest",
    vitest: "latest",
  };

  if (
    alreadyHasEngines &&
    alreadyHasPm &&
    (shouldSkipSelfInstall || hasAgentConfigDevDep) &&
    Object.keys(requiredAuthoringDeps).every((name) => typeof devDeps[name] === "string") &&
    (shouldSkipSelfInstall || hasSetupAgent) &&
    (shouldSkipSelfInstall || hasVerifyPaths) &&
    (shouldSkipSelfInstall || hasVerifySecrets) &&
    (shouldSkipSelfInstall || hasSecretQuarantineAudit) &&
    (shouldSkipSelfInstall || hasPrepareScript) &&
    hasLintScript &&
    hasTypecheckScript &&
    hasTestScript &&
    hasChangesetScript &&
    hasChangesetStatusScript &&
    hasVersionScript &&
    hasReleasePublishScript &&
    hasMutationScript &&
    hasTestMutationScript &&
    hasE2eScript &&
    hasQaScript
  ) {
    return { targetPath: pkgPath, action: "identical" };
  }

  pkg["engines"] = { ...existing, node: engines.node };
  if (!alreadyHasPm) pkg["packageManager"] = packageManager;
  if (typeof pkg["type"] !== "string") pkg["type"] = "module";
  if (typeof pkg["version"] !== "string") pkg["version"] = "0.0.0";

  // Ensure husky is in devDependencies so `vp exec husky init` works
  if (!devDeps["husky"]) {
    devDeps["husky"] = "^9.0.0";
  }
  if (!shouldSkipSelfInstall && !hasAgentConfigDevDep) {
    // Consumers use the global `wp` launcher for execution. Local config
    // presets come from the binary-free agent-config package only.
    devDeps["@webpresso/agent-config"] = DEFAULT_AGENT_CONFIG_RANGE;
  }
  for (const [name, version] of Object.entries(requiredAuthoringDeps)) {
    if (!devDeps[name]) {
      devDeps[name] = version;
    }
  }
  pkg["devDependencies"] = devDeps;

  if (!shouldSkipSelfInstall && !hasSetupAgent) {
    scripts["setup:agent"] = "wp setup";
  }
  if (!shouldSkipSelfInstall && !hasVerifyPaths) {
    scripts["verify:paths"] = verifyPathsScript;
  }
  if (!shouldSkipSelfInstall && !hasVerifySecrets) {
    scripts["verify:secrets"] = verifySecretsScript;
  }
  if (!shouldSkipSelfInstall && !hasSecretQuarantineAudit) {
    scripts["audit:secret-provider-quarantine"] = secretQuarantineAuditScript;
  }
  if (!shouldSkipSelfInstall && !hasPrepareScript) {
    scripts["prepare"] = "husky";
  }
  if (!hasLintScript) {
    scripts["lint"] = lintScript;
  }
  if (!hasTypecheckScript) {
    scripts["typecheck"] = typecheckScript;
  }
  if (!hasTestScript) {
    scripts["test"] = testScript;
  }
  if (!hasChangesetScript) {
    scripts["changeset"] = changesetScript;
  }
  if (!hasChangesetStatusScript) {
    scripts["changeset:status"] = changesetStatusScript;
  }
  if (!hasVersionScript) {
    scripts["version"] = versionScript;
  }
  if (!hasReleasePublishScript) {
    scripts["release:publish"] = releasePublishScript;
  }
  if (!hasMutationScript) {
    scripts["mutation"] = mutationScript;
  }
  if (!hasTestMutationScript) {
    scripts["test:mutation"] = testMutationScript;
  }
  if (!hasE2eScript) {
    scripts["e2e"] = e2eScript;
  }
  if (!hasQaScript) {
    scripts["qa"] = qaScript;
  }
  if (Object.keys(scripts).length > 0) {
    pkg["scripts"] = scripts;
  }

  mkdirSync(dirname(pkgPath), { recursive: true });
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
  return { targetPath: pkgPath, action: "overwritten" };
}

/** agent-kit's own package identity. */
const SELF_PACKAGE_NAMES: readonly string[] = ["@webpresso/agent-kit"];

/** True when `name` is one of agent-kit's own package identities. */
function isSelfPackageName(name: string | undefined): boolean {
  return name !== undefined && SELF_PACKAGE_NAMES.includes(name);
}

/**
 * True when `repoRoot` is agent-kit's own source repo (by package.json name).
 * agent-kit dogfoods base-kit's scripts and shared templates, but the QUALITY
 * starter samples (quality-sample.ts, e2e/smoke, sample configs) are teaching
 * artifacts for FRESH consumer repos — scaffolding them into agent-kit's own
 * source tree is pollution. This flag skips ONLY those samples.
 */
function isAgentKitSelfRepo(repoRoot: string): boolean {
  try {
    const pkg = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8")) as {
      name?: string;
    };
    return isSelfPackageName(pkg.name);
  } catch {
    return false;
  }
}

export function scaffoldBaseKit(input: ScaffoldBaseKitInput): MergeResult[] {
  const { catalogDir, repoRoot, options } = input;
  const baseKitDir = join(catalogDir, "base-kit");
  const results: MergeResult[] = [];
  // Dogfooding boundary: agent-kit gets base-kit's scripts/templates but not the
  // starter quality samples scaffolded into its own source tree.
  const skipStarterSamples = isAgentKitSelfRepo(repoRoot);

  for (const [tmplRel, targetRel] of TEMPLATE_MAP) {
    const tmplPath = join(baseKitDir, tmplRel);
    if (!existsSync(tmplPath)) continue;
    const content = readFileSync(tmplPath, "utf8");
    const targetPath = join(repoRoot, targetRel);
    results.push(writeFileMerged(targetPath, content, options));
  }

  // Bootstrap-only: write template only when target is absent. Never
  // overwrite (even under --overwrite): the consumer's existing file is the
  // source of truth once it exists.
  for (const [tmplRel, targetRel] of BOOTSTRAP_ONLY_MAP) {
    const tmplPath = join(baseKitDir, tmplRel);
    if (!existsSync(tmplPath)) continue;
    const targetPath = join(repoRoot, targetRel);
    if (existsSync(targetPath)) {
      results.push({ targetPath, action: "identical" });
      continue;
    }
    const content = readFileSync(tmplPath, "utf8");
    if (options.dryRun) {
      results.push({ targetPath, action: "skipped-dry" });
      continue;
    }
    mkdirSync(dirname(targetPath), { recursive: true });
    writeFileSync(targetPath, content);
    results.push({ targetPath, action: "created" });
  }

  if (!skipStarterSamples) {
    for (const [tmplRel, targetRel] of QUALITY_BOOTSTRAP_ONLY_MAP) {
      const tmplPath = join(baseKitDir, tmplRel);
      if (!existsSync(tmplPath)) continue;
      const targetPath = join(repoRoot, targetRel);
      if (existsSync(targetPath)) {
        results.push({ targetPath, action: "identical" });
        continue;
      }
      const content = readFileSync(tmplPath, "utf8");
      if (options.dryRun) {
        results.push({ targetPath, action: "skipped-dry" });
        continue;
      }
      mkdirSync(dirname(targetPath), { recursive: true });
      writeFileSync(targetPath, content);
      results.push({ targetPath, action: "created" });
    }
  }

  // Make husky hook files executable
  if (!options.dryRun) {
    for (const [tmplRel, targetRel] of TEMPLATE_MAP) {
      if (tmplRel.startsWith(".husky/")) {
        const targetPath = join(repoRoot, targetRel);
        if (existsSync(targetPath)) {
          try {
            chmodSync(targetPath, 0o755);
          } catch {
            /* non-fatal */
          }
        }
      }
    }
  }

  results.push(mergePackageJson(repoRoot, options));
  return results;
}

function readDependencyBucket(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object") {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] =>
        typeof entry[0] === "string" && typeof entry[1] === "string",
    ),
  );
}

function isNpmInitPlaceholderTestScript(value: string): boolean {
  return /^echo ['"]?Error: no test specified['"]? && exit 1$/u.test(value.trim());
}
