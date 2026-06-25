import path from "node:path";

export const BLUEPRINT_OVERVIEW_FILENAME = "_overview.md";

export const BLUEPRINT_STATUSES = [
  "draft",
  "planned",
  "parked",
  "in-progress",
  "completed",
  "archived",
] as const;

export type BlueprintStatus = (typeof BLUEPRINT_STATUSES)[number];
export type BlueprintShape = "flat" | "folder";

export interface BlueprintDocumentPath {
  relativePath: string;
  shape: BlueprintShape;
  slug: string;
  state: BlueprintStatus;
}

const BLUEPRINT_STATUS_SET = new Set<string>(BLUEPRINT_STATUSES);
const BLUEPRINT_SLUG_SEGMENT_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function normalizeBlueprintPath(filePath: string): string {
  return filePath.replace(/\\/g, "/").replace(/^\/+/, "");
}

export function isBlueprintStatus(value: string | undefined): value is BlueprintStatus {
  return value !== undefined && BLUEPRINT_STATUS_SET.has(value);
}

export function isBlueprintSlugSegment(value: string | undefined): value is string {
  return value !== undefined && BLUEPRINT_SLUG_SEGMENT_PATTERN.test(value);
}

export function parseBlueprintDocumentRelativePath(filePath: string): BlueprintDocumentPath | null {
  const normalized = normalizeBlueprintPath(filePath);
  const parts = normalized.split("/").filter((segment) => segment.length > 0);
  const [state, second, third] = parts;

  if (!isBlueprintStatus(state)) {
    return null;
  }

  if (parts.length === 2 && typeof second === "string" && second.endsWith(".md")) {
    const slug = second.slice(0, -3);
    if (!isBlueprintSlugSegment(slug)) {
      return null;
    }

    return {
      relativePath: `${state}/${slug}.md`,
      shape: "flat",
      slug,
      state,
    };
  }

  if (
    parts.length === 3 &&
    isBlueprintSlugSegment(second) &&
    third === BLUEPRINT_OVERVIEW_FILENAME
  ) {
    return {
      relativePath: `${state}/${second}/${BLUEPRINT_OVERVIEW_FILENAME}`,
      shape: "folder",
      slug: second,
      state,
    };
  }

  return null;
}

export function isBlueprintSupportingMarkdownRelativePath(filePath: string): boolean {
  const normalized = normalizeBlueprintPath(filePath);
  const parts = normalized.split("/").filter((segment) => segment.length > 0);
  const [state, slug, doc] = parts;

  return (
    parts.length === 3 &&
    isBlueprintStatus(state) &&
    isBlueprintSlugSegment(slug) &&
    typeof doc === "string" &&
    doc.endsWith(".md") &&
    doc !== BLUEPRINT_OVERVIEW_FILENAME
  );
}

export function getBlueprintDocumentPaths(root: string, state: BlueprintStatus, slug: string) {
  const directory = path.join(root, state, slug);
  return {
    directory,
    flat: path.join(root, state, `${slug}.md`),
    folder: path.join(directory, BLUEPRINT_OVERVIEW_FILENAME),
  };
}

export function getBlueprintDocumentCandidates(root: string, slug: string): string[] {
  const normalized = normalizeBlueprintPath(slug);
  const segments = normalized.split("/").filter((segment) => segment.length > 0);
  const [state, name] = segments;

  if (segments.length !== 2 || !isBlueprintStatus(state) || !isBlueprintSlugSegment(name)) {
    return [];
  }

  const { flat, folder } = getBlueprintDocumentPaths(root, state, name);
  return [flat, folder];
}

export function getBlueprintAlternateDocumentPath(root: string, filePath: string): string | null {
  const normalized = normalizeBlueprintPath(path.relative(root, filePath));
  const parsed = parseBlueprintDocumentRelativePath(normalized);
  if (!parsed) {
    return null;
  }

  const paths = getBlueprintDocumentPaths(root, parsed.state, parsed.slug);
  return parsed.shape === "flat" ? paths.folder : paths.flat;
}
