import { existsSync, readdirSync, readFileSync } from "node:fs";
import { extname, join, relative } from "node:path";

import type { RepoAuditResult, RepoAuditViolation } from "./repo-guardrails.js";

const SKIP_DIRS = new Set([
  ".git",
  ".omx",
  ".codex",
  ".agent",
  ".agents",
  ".claude",
  "coverage",
  "dist",
  "node_modules",
]);
const SOURCE_EXTENSIONS = new Set([".ts", ".tsx", ".js", ".cjs", ".mjs"]);
const WORKFLOW_EXTENSIONS = new Set([".yml", ".yaml"]);
const WORKFLOW_ROOT_PARTS = [".github", "workflows"] as const;
const NPM_REGISTRY_ORIGIN = "https://" + "registry.npmjs.org";

type TextRule = {
  readonly id: string;
  readonly message: string;
  readonly isViolation: (line: string) => boolean;
};

const TEXT_RULES: readonly TextRule[] = [
  {
    id: "url-substring-allowlist",
    message: "parse URLs and compare protocol/hostname instead of using substring checks",
    isViolation: (line) =>
      line.includes(".includes(") &&
      (line.includes(`"${NPM_REGISTRY_ORIGIN}"`) || line.includes(`'${NPM_REGISTRY_ORIGIN}'`)),
  },
  {
    id: "partial-regex-escape",
    message: "use escapeRegex/escapeRegExp for dynamic RegExp input instead of dot-only escaping",
    isViolation: (line) => line.includes("new RegExp(") && line.includes(".replace(/\\./g"),
  },
  {
    id: "markdown-pipe-backslash-escape",
    message:
      "use shared markdown table cell escaping or HTML entities instead of pipe-only backslash escaping",
    isViolation: (line) =>
      line.includes(".replace(/\\|/g") && (line.includes('"\\\\|"') || line.includes("'\\\\|'")),
  },
];

function toRel(root: string, file: string): string {
  return relative(root, file).replace(/\\/gu, "/");
}

function isWorkflowFile(root: string, file: string): boolean {
  const rel = toRel(root, file);
  return (
    rel.startsWith(`${WORKFLOW_ROOT_PARTS[0]}/${WORKFLOW_ROOT_PARTS[1]}/`) &&
    WORKFLOW_EXTENSIONS.has(extname(file))
  );
}

function isSourceFile(file: string): boolean {
  if (!SOURCE_EXTENSIONS.has(extname(file))) return false;
  return !file.endsWith(".test.ts") && !file.endsWith(".test.tsx");
}

function walkFiles(root: string, dir: string, files: string[]): void {
  if (!existsSync(dir)) return;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue;
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(root, fullPath, files);
      continue;
    }
    if (!entry.isFile()) continue;
    if (isSourceFile(fullPath) || isWorkflowFile(root, fullPath)) files.push(fullPath);
  }
}

function hasTopLevelWorkflowPermissions(content: string): boolean {
  return content.split(/\r?\n/u).some((line) => /^permissions:\s*(?:$|\S)/u.test(line));
}

function allWorkflowJobsHavePermissions(content: string): boolean {
  const lines = content.split(/\r?\n/u);
  const jobStarts: number[] = [];
  const jobsStart = lines.findIndex((line) => /^jobs:\s*$/u.test(line));
  if (jobsStart === -1) return false;
  for (let index = jobsStart + 1; index < lines.length; index += 1) {
    const line = lines[index] ?? "";
    if (/^\S/u.test(line)) break;
    if (/^  [A-Za-z0-9_-]+:\s*$/u.test(line)) jobStarts.push(index);
  }
  if (jobStarts.length === 0) return false;
  return jobStarts.every((start, jobIndex) => {
    const end = jobStarts[jobIndex + 1] ?? lines.length;
    return lines.slice(start + 1, end).some((line) => /^    permissions:\s*(?:$|\S)/u.test(line));
  });
}

function checkWorkflowPermissions(root: string, file: string): RepoAuditViolation[] {
  const content = readFileSync(file, "utf8");
  if (hasTopLevelWorkflowPermissions(content) || allWorkflowJobsHavePermissions(content)) return [];
  const rel = toRel(root, file);
  return [
    {
      file: rel,
      message: `${rel}: workflow must declare top-level least-privilege permissions or job-level permissions for every job`,
    },
  ];
}

function checkSourceRules(root: string, file: string): RepoAuditViolation[] {
  const rel = toRel(root, file);
  const violations: RepoAuditViolation[] = [];
  const lines = readFileSync(file, "utf8").split(/\r?\n/u);
  for (const [index, line] of lines.entries()) {
    for (const rule of TEXT_RULES) {
      if (!rule.isViolation(line)) continue;
      violations.push({
        file: rel,
        message: `${rel}:${index + 1}: ${rule.id}: ${rule.message}`,
      });
    }
  }
  return violations;
}

export function auditSecurityQualityRegressions(
  rootDirectory: string = process.cwd(),
): RepoAuditResult {
  const files: string[] = [];
  walkFiles(rootDirectory, rootDirectory, files);

  const violations = files.flatMap((file) =>
    isWorkflowFile(rootDirectory, file)
      ? checkWorkflowPermissions(rootDirectory, file)
      : checkSourceRules(rootDirectory, file),
  );

  return {
    ok: violations.length === 0,
    title: "security-quality-regressions",
    checked: files.length,
    violations,
  };
}
