import { existsSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import matter from "gray-matter";

import { createPackedManifest, readWorkspaceCatalogs } from "#build/package-manifest.js";
import type { RepoAuditResult, RepoAuditViolation } from "./repo-guardrails.js";

interface ThirdPartySkillManifestEntry {
  slug: string;
  license: string;
  licenseFile?: string;
  upstream: string;
  lastSynced?: string;
}

interface ThirdPartySkillManifest {
  version: number;
  skills: ThirdPartySkillManifestEntry[];
}

const MANIFEST_RELATIVE_PATH = join("catalog", "agent", "skills", "third-party-manifest.json");
const REQUIRED_ROOT_FILES = ["LICENSE", "THIRD-PARTY-NOTICES.md"] as const;
const REQUIRED_PACKED_FILES = ["LICENSE", "THIRD-PARTY-NOTICES.md"] as const;

export function auditOpenSourceLicenses(rootDirectory: string = process.cwd()): RepoAuditResult {
  const root = resolve(rootDirectory);
  const violations: RepoAuditViolation[] = [];
  let checked = 0;

  for (const fileName of REQUIRED_ROOT_FILES) {
    checked += 1;
    const filePath = join(root, fileName);
    if (!existsSync(filePath)) {
      violations.push({
        file: fileName,
        message: `Missing required open-source file at repository root`,
      });
    }
  }

  const manifestPath = join(root, MANIFEST_RELATIVE_PATH);
  if (!existsSync(manifestPath)) {
    violations.push({
      file: relativePath(root, manifestPath),
      message: "Missing third-party skill manifest",
    });
    return result(violations, checked);
  }

  checked += 1;
  const manifest = readManifest(manifestPath, violations, root);
  if (!manifest) {
    return result(violations, checked);
  }

  for (const entry of manifest.skills) {
    checked += auditManifestEntry(root, entry, violations);
  }

  checked += auditPackedSurface(root, violations);

  return result(violations, checked);
}

function auditManifestEntry(
  root: string,
  entry: ThirdPartySkillManifestEntry,
  violations: RepoAuditViolation[],
): number {
  let checked = 1;
  const skillDir = join(root, "catalog", "agent", "skills", entry.slug);
  const skillFile = join(skillDir, "SKILL.md");

  if (!existsSync(skillFile)) {
    violations.push({
      file: relativePath(root, skillFile),
      message: `Manifest lists vendored skill ${entry.slug} but SKILL.md is missing`,
    });
    return checked;
  }

  const raw = readFileSync(skillFile, "utf8");
  const { data } = matter(raw);
  const upstream = readUpstreamSource(data);
  if (!upstream) {
    violations.push({
      file: relativePath(root, skillFile),
      message: `Vendored skill ${entry.slug} must declare upstream.source in frontmatter`,
    });
  } else if (normalizeUrl(upstream) !== normalizeUrl(entry.upstream)) {
    violations.push({
      file: relativePath(root, skillFile),
      message: `upstream.source (${upstream}) must match third-party-manifest.json (${entry.upstream})`,
    });
  }

  const licenseField = typeof data.license === "string" ? data.license.trim() : "";
  if (!licenseField) {
    violations.push({
      file: relativePath(root, skillFile),
      message: `Vendored skill ${entry.slug} must declare license in frontmatter`,
    });
  }

  if (entry.licenseFile) {
    checked += 1;
    const licensePath = join(skillDir, entry.licenseFile);
    if (!existsSync(licensePath)) {
      violations.push({
        file: relativePath(root, licensePath),
        message: `Vendored skill ${entry.slug} requires ${entry.licenseFile}`,
      });
    }
  }

  return checked;
}

function auditPackedSurface(root: string, violations: RepoAuditViolation[]): number {
  let checked = 0;
  const packageJsonPath = join(root, "package.json");
  if (!existsSync(packageJsonPath)) {
    violations.push({ file: "package.json", message: "Missing package.json for npm pack audit" });
    return checked;
  }

  let packedManifest: Record<string, unknown>;
  try {
    packedManifest = computePackedManifest(root, packageJsonPath) as Record<string, unknown>;
  } catch (error) {
    violations.push({
      file: "package.json",
      message: `Could not compute packed manifest: ${errorMessage(error)}`,
    });
    return checked;
  }

  const filesField = packedManifest.files;
  const declaredFiles = Array.isArray(filesField)
    ? filesField.filter((entry): entry is string => typeof entry === "string")
    : [];
  checked += declaredFiles.length;

  for (const required of REQUIRED_PACKED_FILES) {
    // LICENSE / THIRD-PARTY-NOTICES.md are explicit literal `files` entries in
    // the published manifest; on-disk existence is verified separately by the
    // REQUIRED_ROOT_FILES check above.
    if (!declaredFiles.includes(required)) {
      violations.push({
        file: required,
        message: `Published npm tarball must include ${required}`,
      });
    }
  }

  return checked;
}

/**
 * Compute the published package manifest hermetically via the same pure
 * transform npm pack's prepack hook applies (createPackedManifest), instead of
 * a real `npm pack` round-trip. The round-trip ran the prepack lifecycle, which
 * rewrites the live repo's package.json in place behind a fixed-path lock
 * (`.package.json.prepack.backup`) and writes a tarball into the repo root —
 * making the audit non-hermetic and racy under parallel test execution or a
 * leftover backup from an interrupted pack.
 */
function computePackedManifest(
  root: string,
  packageJsonPath: string,
): ReturnType<typeof createPackedManifest> {
  const manifest = JSON.parse(readFileSync(packageJsonPath, "utf8")) as Parameters<
    typeof createPackedManifest
  >[0];
  const workspacePath = join(root, "pnpm-workspace.yaml");
  const workspaceCatalogs: Parameters<typeof createPackedManifest>[1] = existsSync(workspacePath)
    ? readWorkspaceCatalogs(workspacePath)
    : { catalog: undefined, catalogs: undefined };
  return createPackedManifest(manifest, workspaceCatalogs);
}

function readManifest(
  manifestPath: string,
  violations: RepoAuditViolation[],
  root: string,
): ThirdPartySkillManifest | undefined {
  try {
    const parsed = JSON.parse(readFileSync(manifestPath, "utf8")) as ThirdPartySkillManifest;
    if (!Array.isArray(parsed.skills) || parsed.skills.length === 0) {
      violations.push({
        file: relativePath(root, manifestPath),
        message: "third-party-manifest.json must include a non-empty skills array",
      });
      return undefined;
    }
    for (const entry of parsed.skills) {
      if (!entry.slug || !entry.license || !entry.upstream) {
        violations.push({
          file: relativePath(root, manifestPath),
          message: `Manifest entry for ${entry.slug ?? "<unknown>"} must include slug, license, and upstream`,
        });
      }
    }
    return parsed;
  } catch (error) {
    violations.push({
      file: relativePath(root, manifestPath),
      message: `Invalid third-party-manifest.json: ${errorMessage(error)}`,
    });
    return undefined;
  }
}

function readUpstreamSource(data: Record<string, unknown>): string | undefined {
  const upstream = data.upstream;
  if (!upstream || typeof upstream !== "object") return undefined;
  const source = (upstream as { source?: unknown }).source;
  return typeof source === "string" && source.trim().length > 0 ? source.trim() : undefined;
}

function normalizeUrl(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function relativePath(root: string, filePath: string): string {
  return relative(root, filePath).split("\\").join("/");
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function result(violations: RepoAuditViolation[], checked: number): RepoAuditResult {
  return {
    ok: violations.length === 0,
    title: "Open-source license surface",
    checked,
    violations,
  };
}

export function listThirdPartySkillSlugs(rootDirectory: string = process.cwd()): string[] {
  const manifestPath = join(resolve(rootDirectory), MANIFEST_RELATIVE_PATH);
  if (!existsSync(manifestPath)) return [];
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as ThirdPartySkillManifest;
  return manifest.skills.map((entry) => entry.slug);
}
