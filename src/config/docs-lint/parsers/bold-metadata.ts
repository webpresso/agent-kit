/**
 * Parser for legacy bold metadata blocks used in implementation plans.
 * Converts **Key**: Value format to frontmatter-compatible object.
 */

interface BoldMetadata {
  status?: string;
  complexity?: string;
  last_updated?: string;
  [key: string]: string | undefined;
}

/**
 * Pattern to match bold metadata lines: **Key**: Value
 */
const BOLD_METADATA_PATTERN = /^\*\*([^*]+)\*\*:\s*(.+)$/;

/**
 * Common metadata keys in implementation plans
 */
const KNOWN_KEYS: Record<string, string> = {
  Type: "type",
  Status: "status",
  Complexity: "complexity",
  "Last Updated": "last_updated",
  Epic: "epic",
  Priority: "priority",
  Owner: "owner",
  Category: "category",
  Focus: "focus",
};

/**
 * Detect if content contains bold metadata block.
 */
export function hasBoldMetadata(content: string): boolean {
  const lines = content.split("\n").slice(0, 20); // Check first 20 lines
  let foundCount = 0;

  for (const line of lines) {
    if (BOLD_METADATA_PATTERN.test(line.trim())) {
      foundCount++;
    }
  }

  // Need at least 1 bold metadata line
  return foundCount >= 1;
}

/**
 * Find the first H1 title line index in the content
 */
function findTitleLineIndex(lines: string[]): number {
  for (let i = 0; i < lines.length; i++) {
    if (lines[i]?.trim().startsWith("# ")) {
      return i;
    }
  }
  return -1;
}

/**
 * Parse a single metadata line and return key-value pair if valid
 */
function parseMetadataLine(line: string): { key: string; value: string } | null {
  const match = line.trim().match(BOLD_METADATA_PATTERN);
  if (!match) return null;

  const rawKey = match[1];
  const rawValue = match[2];
  if (!rawKey || !rawValue) return null;

  const key = KNOWN_KEYS[rawKey] ?? rawKey.toLowerCase().replace(/\s+/g, "_");
  return { key, value: rawValue.trim() };
}

/**
 * Check if we should stop searching for metadata
 */
function shouldStopSearching(line: string, hasFoundMetadata: boolean): boolean {
  const trimmed = line.trim();
  return (
    hasFoundMetadata &&
    trimmed !== "" &&
    !trimmed.startsWith(">") &&
    !trimmed.startsWith("#") &&
    !BOLD_METADATA_PATTERN.test(trimmed)
  );
}

interface MetadataSearchContext {
  lines: string[];
  metadata: BoldMetadata;
  metadataLineIndices: number[];
}

/**
 * Search for metadata in a range of lines
 */
function searchMetadataInRange(ctx: MetadataSearchContext, start: number, end: number): void {
  for (let i = start; i < end; i++) {
    const currentLine = ctx.lines[i];
    if (!currentLine) continue;

    const parsed = parseMetadataLine(currentLine);
    if (parsed) {
      ctx.metadata[parsed.key] = parsed.value;
      ctx.metadataLineIndices.push(i);
    } else if (shouldStopSearching(currentLine, ctx.metadataLineIndices.length > 0)) {
      break;
    }
  }
}

/**
 * Get search ranges based on title position
 */
function getSearchRanges(
  titleLineIndex: number,
  linesLength: number,
): Array<{ start: number; end: number }> {
  const ranges: Array<{ start: number; end: number }> = [];

  if (titleLineIndex > 0) {
    ranges.push({ start: 0, end: titleLineIndex });
  }

  if (titleLineIndex >= 0) {
    const searchStart = titleLineIndex + 1;
    ranges.push({ start: searchStart, end: Math.min(searchStart + 15, linesLength) });
  } else {
    ranges.push({ start: 0, end: Math.min(20, linesLength) });
  }

  return ranges;
}

/**
 * Parse bold metadata block from content.
 * Returns parsed metadata and the content without the metadata block.
 */
export function parseBoldMetadata(content: string): {
  metadata: BoldMetadata;
  contentWithoutMetadata: string;
} {
  const lines = content.split("\n");
  const ctx: MetadataSearchContext = { lines, metadata: {}, metadataLineIndices: [] };

  const titleLineIndex = findTitleLineIndex(lines);
  const searchRanges = getSearchRanges(titleLineIndex, lines.length);

  for (const { start, end } of searchRanges) {
    searchMetadataInRange(ctx, start, end);
  }

  const filteredLines = lines.filter((_, i) => !ctx.metadataLineIndices.includes(i));
  let cleanedContent = filteredLines.join("\n");
  cleanedContent = cleanedContent.replace(/^(# .+\n)\n{3,}/m, "$1\n\n");

  return {
    metadata: ctx.metadata,
    contentWithoutMetadata: cleanedContent,
  };
}

/**
 * Convert bold metadata values to frontmatter-compatible format.
 */
export function normalizeBoldMetadata(metadata: BoldMetadata): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    if (value === undefined) continue;

    switch (key) {
      case "type":
        // Normalize type to lowercase: "Core" -> "core"
        result.type = value.toLowerCase();
        break;

      case "status":
        // Normalize status values: "In Progress" -> "in-progress"
        result.status = value.toLowerCase().replace(/\s+/g, "-");
        break;

      case "complexity":
        // Keep uppercase: XS, S, M, L, XL
        result.complexity = value.toUpperCase();
        break;

      case "last_updated":
        // Parse date formats: "2025-12-05" or "December 5, 2025"
        result.last_updated = parseDate(value);
        break;

      default:
        result[key] = value;
    }
  }

  return result;
}

/**
 * Parse various date formats to YYYY-MM-DD.
 */
function parseDate(dateStr: string): string {
  // Already in YYYY-MM-DD format
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }

  // Try parsing with Date
  const date = new Date(dateStr);
  if (!Number.isNaN(date.getTime())) {
    const result = date.toISOString().split("T")[0];
    return result ?? dateStr;
  }

  // Return as-is if we can't parse
  return dateStr;
}
