/**
 * Minimal YAML frontmatter parser used by the Gemini TOML writer.
 *
 * Intentionally hand-rolled rather than depending on `gray-matter` because
 * `webpresso/symlinker` must stay runtime-dependency-free at the
 * leaf level — the symlinker ships inside the `wp` CLI and is called from
 * hot paths where pulling in a YAML engine for a single `description:` line
 * is overkill.
 */
export interface ParsedFrontmatter {
    description: string;
    body: string;
}
export declare function parseMarkdownFrontmatter(content: string): ParsedFrontmatter;
//# sourceMappingURL=frontmatter.d.ts.map