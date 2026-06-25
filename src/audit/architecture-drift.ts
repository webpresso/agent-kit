import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { escapeRegExp } from "#utils/string";

import type { RepoAuditResult, RepoAuditViolation } from "./repo-guardrails.js";

export interface ArchitectureDriftRule {
  id: string;
  description?: string;
  paths: readonly string[];
  mustContain?: readonly string[];
  mustNotContain?: readonly string[];
  allowMissing?: boolean;
  caseSensitive?: boolean;
}

export interface ArchitectureBlueprintPolicy {
  enabled?: boolean;
  blueprintGlobs?: readonly string[];
  architectureDocGlobs?: readonly string[];
  requireArchitectureLinks?: boolean;
  requireBeforeAfterWhenArchitectureChanging?: boolean;
  architectureChangeMarkers?: readonly string[];
  beforeHeading?: string;
  afterHeading?: string;
  exemptStatuses?: readonly string[];
}

export interface ArchitectureDriftContract {
  version: 1;
  architectureDocs?: readonly string[];
  requiredFiles?: readonly string[];
  rules?: readonly ArchitectureDriftRule[];
  blueprintPolicy?: ArchitectureBlueprintPolicy;
}

export interface ArchitectureDriftOptions {
  contractPath?: string;
}

const DEFAULT_CONTRACT_PATH = "docs/architecture.contract.json";
const DEFAULT_BLUEPRINT_GLOBS = ["blueprints/**/*.md"] as const;
const DEFAULT_ARCHITECTURE_DOC_GLOBS = [
  "docs/architecture*.md",
  "docs/architecture/**/*.md",
] as const;
const DEFAULT_CHANGE_MARKERS = [
  "data flow",
  "state machine",
  "runtime topology",
  "port",
  "ports/adapters",
  "adapter",
  "deployment",
  "storage boundary",
  "storage boundaries",
  "queue strategy",
  "public contract",
  "queue",
  "infrastructure",
  "infra",
] as const;
const DEFAULT_EXEMPT_STATUSES = ["completed", "archived"] as const;

const IGNORED_DIRS = new Set([
  ".git",
  ".agent",
  ".agents",
  ".codex",
  ".cursor",
  ".omc",
  ".omx",
  ".opencode",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results",
]);

function makeViolation(file: string, message: string): RepoAuditViolation {
  return { file, message };
}

function readJson(filePath: string): unknown {
  return JSON.parse(readFileSync(filePath, "utf8"));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

function parseBlueprintPolicy(
  value: unknown,
  prefix: string,
): ArchitectureBlueprintPolicy | string {
  if (!isRecord(value)) return `${prefix} must be an object`;
  for (const key of [
    "blueprintGlobs",
    "architectureDocGlobs",
    "architectureChangeMarkers",
    "exemptStatuses",
  ] as const) {
    if (value[key] !== undefined && !isStringArray(value[key]))
      return `${prefix}.${key} must be an array of strings`;
  }
  for (const key of [
    "enabled",
    "requireArchitectureLinks",
    "requireBeforeAfterWhenArchitectureChanging",
  ] as const) {
    if (value[key] !== undefined && typeof value[key] !== "boolean")
      return `${prefix}.${key} must be a boolean`;
  }
  for (const key of ["beforeHeading", "afterHeading"] as const) {
    if (value[key] !== undefined && typeof value[key] !== "string")
      return `${prefix}.${key} must be a string`;
  }
  return value as unknown as ArchitectureBlueprintPolicy;
}

function parseContract(value: unknown): ArchitectureDriftContract | string {
  if (!isRecord(value)) return "contract must be a JSON object";
  if (value.version !== 1) return "contract version must be 1";

  if (value.architectureDocs !== undefined && !isStringArray(value.architectureDocs)) {
    return "architectureDocs must be an array of file paths";
  }
  if (value.requiredFiles !== undefined && !isStringArray(value.requiredFiles)) {
    return "requiredFiles must be an array of file paths";
  }
  if (value.rules !== undefined && !Array.isArray(value.rules)) {
    return "rules must be an array";
  }
  if (value.blueprintPolicy !== undefined) {
    const parsed = parseBlueprintPolicy(value.blueprintPolicy, "blueprintPolicy");
    if (typeof parsed === "string") return parsed;
  }

  const rules = (value.rules ?? []) as unknown[];
  for (const [index, rawRule] of rules.entries()) {
    if (!isRecord(rawRule)) return `rules[${index}] must be an object`;
    if (typeof rawRule.id !== "string" || rawRule.id.trim() === "") {
      return `rules[${index}].id must be a non-empty string`;
    }
    if (!isStringArray(rawRule.paths) || rawRule.paths.length === 0) {
      return `rules[${index}].paths must be a non-empty array of file globs`;
    }
    if (rawRule.mustContain !== undefined && !isStringArray(rawRule.mustContain)) {
      return `rules[${index}].mustContain must be an array of strings`;
    }
    if (rawRule.mustNotContain !== undefined && !isStringArray(rawRule.mustNotContain)) {
      return `rules[${index}].mustNotContain must be an array of strings`;
    }
    if (rawRule.allowMissing !== undefined && typeof rawRule.allowMissing !== "boolean") {
      return `rules[${index}].allowMissing must be a boolean`;
    }
    if (rawRule.caseSensitive !== undefined && typeof rawRule.caseSensitive !== "boolean") {
      return `rules[${index}].caseSensitive must be a boolean`;
    }
  }

  return value as unknown as ArchitectureDriftContract;
}

function normalizeRelPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function globToRegExp(pattern: string): RegExp {
  const normalized = pattern.replace(/\\/g, "/");
  let out = "^";
  for (let i = 0; i < normalized.length; i += 1) {
    const char = normalized[i];
    const next = normalized[i + 1];
    if (char === "*" && next === "*") {
      const after = normalized[i + 2];
      if (after === "/") {
        out += "(?:.*/)?";
        i += 2;
      } else {
        out += ".*";
        i += 1;
      }
      continue;
    }
    if (char === "*") {
      out += "[^/]*";
      continue;
    }
    out += escapeRegExp(char ?? "");
  }
  out += "$";
  return new RegExp(out);
}

function walkFiles(root: string): string[] {
  const result: string[] = [];

  function walk(dir: string): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) continue;
        walk(path.join(dir, entry.name));
        continue;
      }
      if (entry.isFile()) result.push(path.join(dir, entry.name));
    }
  }

  if (existsSync(root)) walk(root);
  return result.sort();
}

function expandPatterns(root: string, patterns: readonly string[]): string[] {
  const allFiles = walkFiles(root);
  const matched = new Set<string>();

  for (const pattern of patterns) {
    const normalizedPattern = pattern.replace(/\\/g, "/");
    if (!normalizedPattern.includes("*")) {
      const absolute = path.resolve(root, normalizedPattern);
      if (existsSync(absolute)) matched.add(absolute);
      continue;
    }

    const regex = globToRegExp(normalizedPattern);
    for (const file of allFiles) {
      const rel = normalizeRelPath(path.relative(root, file));
      if (regex.test(rel)) matched.add(file);
    }
  }

  return [...matched].sort();
}

function includes(haystack: string, needle: string, caseSensitive: boolean): boolean {
  if (caseSensitive) return haystack.includes(needle);
  return haystack.toLowerCase().includes(needle.toLowerCase());
}

function auditRule(
  root: string,
  contractRelPath: string,
  rule: ArchitectureDriftRule,
): { checked: number; violations: RepoAuditViolation[] } {
  const violations: RepoAuditViolation[] = [];
  const files = expandPatterns(root, rule.paths);
  const caseSensitive = rule.caseSensitive ?? true;

  if (files.length === 0) {
    if (!rule.allowMissing) {
      violations.push(
        makeViolation(
          contractRelPath,
          `architecture rule "${rule.id}" matched no files for paths: ${rule.paths.join(", ")}`,
        ),
      );
    }
    return { checked: 0, violations };
  }

  const fileContents = files.map((file) => ({
    absolute: file,
    relative: normalizeRelPath(path.relative(root, file)),
    content: readFileSync(file, "utf8"),
  }));
  const joined = fileContents.map((file) => file.content).join("\n");

  for (const required of rule.mustContain ?? []) {
    if (!includes(joined, required, caseSensitive)) {
      violations.push(
        makeViolation(
          contractRelPath,
          `architecture rule "${rule.id}" missing required text ${JSON.stringify(required)} in ${rule.paths.join(", ")}`,
        ),
      );
    }
  }

  for (const forbidden of rule.mustNotContain ?? []) {
    for (const file of fileContents) {
      if (!includes(file.content, forbidden, caseSensitive)) continue;
      violations.push(
        makeViolation(
          file.relative,
          `architecture rule "${rule.id}" found forbidden text ${JSON.stringify(forbidden)}`,
        ),
      );
    }
  }

  return { checked: files.length, violations };
}

function extractFrontmatterValue(content: string, key: string): string | null {
  if (!content.startsWith("---\n")) return null;
  const end = content.indexOf("\n---", 4);
  if (end === -1) return null;
  const frontmatter = content.slice(4, end);
  const match = frontmatter.match(
    new RegExp(`^${escapeRegExp(key)}:\\s*["']?([^"'\\n]+)["']?\\s*$`, "m"),
  );
  return match?.[1]?.trim() ?? null;
}

function hasHeading(content: string, heading: string): boolean {
  const expected = heading
    .trim()
    .replace(/^#+\s*/u, "")
    .toLowerCase();
  return content.split("\n").some(
    (line) =>
      line
        .replace(/^#+\s*/u, "")
        .trim()
        .toLowerCase() === expected,
  );
}

function findMissingArchitectureDocRefs(
  content: string,
  architectureDocRefs: readonly string[],
): string[] {
  return architectureDocRefs.filter((doc) => !content.includes(doc));
}

function isArchitectureChanging(content: string, markers: readonly string[]): boolean {
  const normalized = content.toLowerCase();
  return markers.some((marker) => normalized.includes(marker.toLowerCase()));
}

function auditBlueprintPolicy(
  root: string,
  contractRelPath: string,
  contract: ArchitectureDriftContract,
): { checked: number; violations: RepoAuditViolation[] } {
  const policy = contract.blueprintPolicy;
  if (!policy || policy.enabled === false) return { checked: 0, violations: [] };

  const violations: RepoAuditViolation[] = [];
  const blueprintFiles = expandPatterns(root, policy.blueprintGlobs ?? DEFAULT_BLUEPRINT_GLOBS);
  const architectureDocFiles = expandPatterns(
    root,
    policy.architectureDocGlobs ?? contract.architectureDocs ?? DEFAULT_ARCHITECTURE_DOC_GLOBS,
  );
  const architectureDocRefs = [
    contractRelPath,
    ...(contract.architectureDocs ?? []),
    ...architectureDocFiles.map((file) => normalizeRelPath(path.relative(root, file))),
  ];
  const requiredDocRefs = [...new Set(architectureDocRefs)];
  const exemptStatuses = new Set(policy.exemptStatuses ?? DEFAULT_EXEMPT_STATUSES);
  const markers = policy.architectureChangeMarkers ?? DEFAULT_CHANGE_MARKERS;
  const beforeHeading = policy.beforeHeading ?? "Architecture before";
  const afterHeading = policy.afterHeading ?? "Architecture after";

  if (requiredDocRefs.length === 0 && policy.requireArchitectureLinks !== false) {
    violations.push(
      makeViolation(
        contractRelPath,
        "blueprintPolicy requires architecture links but no architecture docs were found",
      ),
    );
  }

  for (const file of blueprintFiles) {
    const rel = normalizeRelPath(path.relative(root, file));
    const content = readFileSync(file, "utf8");
    const status = extractFrontmatterValue(content, "status");
    if (status && exemptStatuses.has(status)) continue;

    if (policy.requireArchitectureLinks !== false) {
      const missingRefs = findMissingArchitectureDocRefs(content, requiredDocRefs);
      if (missingRefs.length > 0) {
        violations.push(
          makeViolation(
            rel,
            `blueprint must link its governing architecture docs: ${missingRefs.join(", ")}`,
          ),
        );
      }
    }

    if (
      policy.requireBeforeAfterWhenArchitectureChanging !== false &&
      isArchitectureChanging(content, markers)
    ) {
      if (!hasHeading(content, beforeHeading)) {
        violations.push(
          makeViolation(rel, `architecture-changing blueprint must include "${beforeHeading}"`),
        );
      }
      if (!hasHeading(content, afterHeading)) {
        violations.push(
          makeViolation(rel, `architecture-changing blueprint must include "${afterHeading}"`),
        );
      }
    }
  }

  return { checked: blueprintFiles.length, violations };
}

export function auditArchitectureDrift(
  rootDirectory: string = process.cwd(),
  options: ArchitectureDriftOptions = {},
): RepoAuditResult {
  const root = path.resolve(rootDirectory);
  const contractRelPath = normalizeRelPath(options.contractPath ?? DEFAULT_CONTRACT_PATH);
  const contractPath = path.resolve(root, contractRelPath);

  if (!existsSync(contractPath)) {
    return {
      ok: true,
      title: "architecture drift",
      checked: 0,
      violations: [],
    };
  }

  let parsed: unknown;
  try {
    parsed = readJson(contractPath);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return {
      ok: false,
      title: "architecture drift",
      checked: 1,
      violations: [
        makeViolation(contractRelPath, `architecture contract is invalid JSON: ${message}`),
      ],
    };
  }

  const contract = parseContract(parsed);
  if (typeof contract === "string") {
    return {
      ok: false,
      title: "architecture drift",
      checked: 1,
      violations: [makeViolation(contractRelPath, contract)],
    };
  }

  const violations: RepoAuditViolation[] = [];
  let checked = 1;

  for (const requiredFile of [
    ...(contract.architectureDocs ?? []),
    ...(contract.requiredFiles ?? []),
  ]) {
    checked += 1;
    if (!existsSync(path.resolve(root, requiredFile))) {
      violations.push(
        makeViolation(contractRelPath, `required architecture file missing: ${requiredFile}`),
      );
    }
  }

  for (const rule of contract.rules ?? []) {
    const result = auditRule(root, contractRelPath, rule);
    checked += result.checked;
    violations.push(...result.violations);
  }

  const blueprintResult = auditBlueprintPolicy(root, contractRelPath, contract);
  checked += blueprintResult.checked;
  violations.push(...blueprintResult.violations);

  return {
    ok: violations.length === 0,
    title: "architecture drift",
    checked,
    violations,
  };
}
