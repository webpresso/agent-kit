import matter from "gray-matter";

export interface ParsedSection {
  readonly slug: string;
  readonly heading: string;
  readonly content: string;
}

export interface ParsedDocument {
  readonly frontmatter: Readonly<Record<string, unknown>>;
  readonly sections: readonly ParsedSection[];
}

function toSlug(heading: string): string {
  return heading.toLowerCase().replace(/\s+/gu, "-");
}

export function parseDocument(fileContent: string): ParsedDocument {
  const parsed = matter(fileContent);
  const frontmatter = parsed.data as Record<string, unknown>;
  const body = parsed.content;

  // Split on h2 boundaries (## heading) — no remark needed
  const sectionParts = body.split(/\n(?=## )/u);
  const sections: ParsedSection[] = [];

  for (const part of sectionParts) {
    const trimmed = part.trimStart();
    if (!trimmed.startsWith("## ")) {
      // Content before first ## heading — skip or treat as preamble (ignored)
      continue;
    }
    const newlineIndex = trimmed.indexOf("\n");
    const headingLine =
      newlineIndex >= 0 ? trimmed.slice(3, newlineIndex).trim() : trimmed.slice(3).trim();
    const content = newlineIndex >= 0 ? trimmed.slice(newlineIndex + 1) : "";
    sections.push({
      slug: toSlug(headingLine),
      heading: headingLine,
      content,
    });
  }

  return { frontmatter, sections };
}

export function serializeDocument(
  frontmatter: Readonly<Record<string, unknown>>,
  sections: ReadonlyMap<string, { heading: string; content: string }>,
): string {
  const hasFrontmatter = Object.keys(frontmatter).length > 0;
  const fm = hasFrontmatter ? matter.stringify("", frontmatter).trimEnd() + "\n" : "";
  const body = [...sections.values()]
    .map(({ heading, content }) => {
      const trimmedContent = content.trimEnd();
      return trimmedContent.length > 0 ? `## ${heading}\n${trimmedContent}` : `## ${heading}`;
    })
    .join("\n\n");
  return fm + body + "\n";
}
