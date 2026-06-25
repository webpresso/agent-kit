import { existsSync } from "node:fs";
import path from "node:path";
import {
  BLUEPRINT_OVERVIEW_FILENAME,
  getBlueprintAlternateDocumentPath,
  isBlueprintSupportingMarkdownRelativePath,
  isBlueprintStatus,
  parseBlueprintDocumentRelativePath,
} from "#utils/document-paths.js";

export const BLUEPRINTS_ROOT = "webpresso/blueprints";
const DEFAULT_BLUEPRINTS_ROOT = "blueprints";
export const TECH_DEBT_ROOT = "webpresso/tech-debt";
const DEFAULT_TECH_DEBT_ROOT = "tech-debt";

// Both canonical blueprint-root layouts accepted by default.
const CANONICAL_BLUEPRINTS_ROOTS = [BLUEPRINTS_ROOT, DEFAULT_BLUEPRINTS_ROOT] as const;
const CANONICAL_TECH_DEBT_ROOTS = [TECH_DEBT_ROOT, DEFAULT_TECH_DEBT_ROOT] as const;

function normalizePlanningPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\//, "");
}

function matchesRoot(normalized: string, root: string): boolean {
  return normalized === root || normalized.startsWith(`${root}/`);
}

function stripBlueprintRoot(
  normalized: string,
  roots: readonly string[],
): { relativePath: string; root: string } | null {
  for (const root of roots) {
    if (normalized === root) return { relativePath: "", root };
    if (normalized.startsWith(`${root}/`)) {
      return { relativePath: normalized.slice(root.length + 1), root };
    }
  }
  return null;
}

/**
 * Returns true if the path is under any accepted blueprints root.
 * Pass `blueprintsRoot` to restrict to a single configured root.
 */
export function isBlueprintPath(filePath: string, blueprintsRoot?: string): boolean {
  const normalized = normalizePlanningPath(filePath);
  if (blueprintsRoot !== undefined) return matchesRoot(normalized, blueprintsRoot);
  return CANONICAL_BLUEPRINTS_ROOTS.some((root) => matchesRoot(normalized, root));
}

export function getNonCanonicalPlanningPathViolation(
  filePath: string,
  blueprintsRoot?: string,
  techDebtRoot?: string,
): string | null {
  const normalized = normalizePlanningPath(filePath);

  const bpRoots = blueprintsRoot ? [blueprintsRoot] : CANONICAL_BLUEPRINTS_ROOTS;
  const tdRoots = techDebtRoot ? [techDebtRoot] : CANONICAL_TECH_DEBT_ROOTS;

  if (
    bpRoots.some((r) => matchesRoot(normalized, r)) ||
    tdRoots.some((r) => matchesRoot(normalized, r))
  ) {
    return null;
  }

  if (!normalized.endsWith(".md")) return null;

  const parts = normalized.split("/");
  if (parts.length < 2) return null;

  const secondSegment = parts[1];
  if (
    secondSegment === "blueprints" ||
    secondSegment === "tech-debt" ||
    secondSegment === "plan-history"
  ) {
    const bpLabel = blueprintsRoot
      ? `${blueprintsRoot}/`
      : `${DEFAULT_BLUEPRINTS_ROOT}/ or ${BLUEPRINTS_ROOT}/`;
    const tdLabel = techDebtRoot
      ? `${techDebtRoot}/`
      : `${DEFAULT_TECH_DEBT_ROOT}/ or ${TECH_DEBT_ROOT}/`;
    return `Planning markdown must live under ${bpLabel} or ${tdLabel}. Got: ${normalized}`;
  }

  if (parts[0] === "platform") {
    const expectedBp = blueprintsRoot ?? BLUEPRINTS_ROOT;
    return `Legacy planning paths under platform/* are no longer supported. Move blueprints to ${expectedBp}/.`;
  }

  return null;
}

/**
 * Returns true if the path is the canonical `_overview.md` location for any
 * accepted blueprints root layout (or the explicitly provided root).
 */
export function isCanonicalBlueprintOverviewPath(
  filePath: string,
  blueprintsRoot?: string,
): boolean {
  const parsed = getCanonicalBlueprintDocument(filePath, blueprintsRoot);
  return parsed?.shape === "folder";
}

export function isCanonicalBlueprintDocumentPath(
  filePath: string,
  blueprintsRoot?: string,
): boolean {
  return getCanonicalBlueprintDocument(filePath, blueprintsRoot) !== null;
}

function getCanonicalBlueprintDocument(filePath: string, blueprintsRoot?: string) {
  const normalized = normalizePlanningPath(filePath);
  const roots = blueprintsRoot ? [blueprintsRoot] : CANONICAL_BLUEPRINTS_ROOTS;
  const stripped = stripBlueprintRoot(normalized, roots);
  return stripped ? parseBlueprintDocumentRelativePath(stripped.relativePath) : null;
}

export function getBlueprintPathViolation(
  filePath: string,
  blueprintsRoot?: string,
  cwd: string = process.cwd(),
): string | null {
  const normalized = normalizePlanningPath(filePath);

  if (!isBlueprintPath(normalized, blueprintsRoot)) return null;

  const roots = blueprintsRoot ? [blueprintsRoot] : CANONICAL_BLUEPRINTS_ROOTS;
  const stripped = stripBlueprintRoot(normalized, roots);
  if (!stripped) {
    return null;
  }

  const parsed = parseBlueprintDocumentRelativePath(stripped.relativePath);
  if (parsed) {
    const blueprintRoot = path.isAbsolute(filePath)
      ? path.join(path.parse(filePath).root, stripped.root)
      : path.join(cwd, stripped.root);
    const currentPath = path.isAbsolute(filePath) ? filePath : path.join(cwd, normalized);
    const alternate = getBlueprintAlternateDocumentPath(blueprintRoot, currentPath);
    if (alternate && existsSync(alternate)) {
      return `Blueprint slug "${parsed.state}/${parsed.slug}" cannot exist in both flat and folder forms. Remove either ${path.relative(cwd, filePath).replace(/\\/g, "/")} or ${path.relative(cwd, alternate).replace(/\\/g, "/")}.`;
    }
    return null;
  }

  const parts = stripped.relativePath.split("/").filter((segment) => segment.length > 0);
  const [state, slug, doc] = parts;
  const root = stripped.root;

  if (
    parts.length === 2 &&
    typeof doc === "undefined" &&
    typeof slug === "string" &&
    slug.endsWith(".md")
  ) {
    return `Blueprint markdown under ${root}/<status>/ must be either <slug>.md or <slug>/${BLUEPRINT_OVERVIEW_FILENAME}. Got: ${normalized}`;
  }

  if (parts.length === 3 && doc === BLUEPRINT_OVERVIEW_FILENAME) {
    return `Blueprint overview files must live at ${root}/<status>/<slug>/${BLUEPRINT_OVERVIEW_FILENAME}. Got: ${normalized}`;
  }

  if (parts.length === 3 && isBlueprintSupportingMarkdownRelativePath(stripped.relativePath)) {
    const canonicalOverviewPath = path.join(
      cwd,
      root,
      state ?? "",
      slug ?? "",
      BLUEPRINT_OVERVIEW_FILENAME,
    );
    if (!existsSync(canonicalOverviewPath)) {
      return `Supporting blueprint markdown requires ${root}/${state}/${slug}/${BLUEPRINT_OVERVIEW_FILENAME}. Got: ${normalized}`;
    }
    return null;
  }

  if (parts.length >= 3 && isBlueprintStatus(state)) {
    return `Blueprint markdown must use one of ${root}/<status>/<slug>.md or ${root}/<status>/<slug>/${BLUEPRINT_OVERVIEW_FILENAME}. Supporting markdown is only allowed beside ${BLUEPRINT_OVERVIEW_FILENAME}. Got: ${normalized}`;
  }

  return null;
}
