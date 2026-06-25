import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const LEGACY_BIN_PATTERNS = [
  /(?:^|[\s"'`([{])(?<cmd>wp|cli2|ak)(?=$|[\s"'`,)\]}])/u,
  /(?:^|[\s"'`([{])(?<cmd>ak-pretool-guard|ak-post-tool|ak-stop-qa|ak-guard-switch|ak-sessionstart-routing)(?=$|[\s"'`,)\]}])/u,
] as const;

const DEFAULT_SCAN_TARGETS = ["apps", "packages", ".github"] as const;

const ALLOWLIST_PATH_PATTERNS = [
  /^docs\/changelog\//u,
  /^docs\/guides\/operations-guide\.md$/u,
  /^docs\/migrations\//u,
  /^docs\/research\//u,
  /^docs\/system\/customer-surface-ledger\.md$/u,
  /^docs\/system\/public-surface-deprecation\.md$/u,
  /^apps\/cli-wp\//u,
  /^apps\/cli2\//u,
  /^apps\/scripts\/src\/dev\/utils\/add-test-variants\.ts$/u,
  /^apps\/scripts\/src\/maintenance\/update-test-scripts\.ts$/u,
  /^apps\/scripts\/src\/audit\/agent-kit-hard-cut-boundary\.test\.ts$/u,
  /^apps\/scripts\/src\/git-hooks\/pre-commit(?:\.test)?\.ts$/u,
  /^apps\/scripts\/src\/validation\/vite-plus-migration-audit\.test\.ts$/u,
  /^apps\/tenant-artifacts\/sources\/website\/app\/routeTree\.gen\.ts$/u,
  /^apps\/tenant-artifacts\/sources\/website\/app\/routes(?:-helpers)?(?:\.test)?\.ts$/u,
  /^apps\/tenant-artifacts\/sources\/website\/app\/routes\/docs(?:\._index|\.wp)?(?:\.test)?\.tsx$/u,
  /^apps\/tenant-artifacts\/sources\/website\/app\/tsr-routes\/docs\.wp\.tsx$/u,
  /^apps\/tenant-artifacts\/sources\/website\/playwright-mocked\/accessibility\/website\.spec\.ts$/u,
  /^packages\/cli\/bundles\/agent\/src\/audits\/no-legacy-cli-bin(?:\.test)?\.ts$/u,
  /^packages\/cli\/bundles\/internal\//u,
  /^packages\/foundation\/docs-linter\/src\/validators\/deprecated-commands(?:\.test)?\.ts$/u,
  /^packages\/feature\/automation-contracts\/src\/contracts\.ts$/u,
  /^packages\/docs-site\/\.generated\/content\/docs\/research\//u,
  /^packages\/docs-site\/\.generated\/content\/docs\/guides\/operations-guide\.md$/u,
  /^packages\/docs-site\/\.generated\/content\/docs\/system\/customer-surface-ledger\.md$/u,
  /^packages\/docs-site\/\.generated\/content\/docs\/system\/public-surface-deprecation\.md$/u,
] as const;

const SKIP_DIRECTORY_NAMES = new Set([
  ".git",
  ".generated",
  ".next",
  ".omx",
  ".pnpm-store",
  ".stryker-tmp",
  ".turbo",
  ".wrangler",
  "build",
  "coverage",
  "dist",
  "logs",
  "node_modules",
  "playwright-report-smoke",
  "public",
  "reports",
  "test-results",
  "tmp",
  "__fixtures__",
  "__snapshots__",
]);

export interface LegacyCliBinFinding {
  readonly line: number;
  readonly match: string;
  readonly path: string;
}

function isAllowlistedPath(path: string): boolean {
  return ALLOWLIST_PATH_PATTERNS.some((pattern) => pattern.test(path));
}

function shouldSkipPath(path: string): boolean {
  if (path.split("/").some((segment) => SKIP_DIRECTORY_NAMES.has(segment))) {
    return true;
  }

  return (
    path.endsWith(".md") ||
    path.endsWith(".mdx") ||
    path.endsWith(".snap") ||
    path.endsWith(".png") ||
    path.endsWith(".jpg") ||
    path.endsWith(".svg")
  );
}

function* walkFiles(path: string): Generator<string> {
  const stats = statSync(path);
  if (stats.isFile()) {
    yield path;
    return;
  }

  if (!stats.isDirectory()) {
    return;
  }

  for (const entry of readdirSync(path, { withFileTypes: true })) {
    const childPath = join(path, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRECTORY_NAMES.has(entry.name)) {
        continue;
      }
      yield* walkFiles(childPath);
      continue;
    }

    if (entry.isFile()) {
      yield childPath;
    }
  }
}

function collectLegacyCliBinFindings(repoRoot: string): LegacyCliBinFinding[] {
  const findings: LegacyCliBinFinding[] = [];

  for (const target of DEFAULT_SCAN_TARGETS) {
    const absoluteTarget = join(repoRoot, target);
    if (!existsSync(absoluteTarget)) {
      continue;
    }

    for (const absolutePath of walkFiles(absoluteTarget)) {
      const relativePath = relative(repoRoot, absolutePath).replaceAll("\\", "/");

      if (shouldSkipPath(relativePath) || isAllowlistedPath(relativePath)) {
        continue;
      }

      let content: string;
      try {
        content = readFileSync(absolutePath, "utf8");
      } catch {
        continue;
      }

      for (const [index, line] of content.split(/\r?\n/u).entries()) {
        if (line.includes("--wp-")) {
          continue;
        }
        for (const pattern of LEGACY_BIN_PATTERNS) {
          const match = line.match(pattern);
          const found = match?.groups?.cmd ?? match?.[1];
          if (!found) {
            continue;
          }

          findings.push({
            line: index + 1,
            match: found,
            path: relativePath,
          });
          break;
        }
      }
    }
  }

  return findings;
}

export function runNoLegacyCliBinAudit(repoRoot = process.cwd()): void {
  const findings = collectLegacyCliBinFindings(repoRoot);

  if (findings.length === 0) {
    console.log("No active legacy CLI bin invocations found.");
    return;
  }

  const renderedFindings = findings
    .map((finding) => `- ${finding.path}:${finding.line} (${finding.match})`)
    .join("\n");

  throw new Error(
    [
      "Found active legacy CLI bin invocations outside the explicit migration-history allowlist.",
      renderedFindings,
    ].join("\n"),
  );
}
