/**
 * Generic content loader for canonical (catalog) + consumer
 * (`agent-rules/`, `agent-skills/`) trees.
 *
 * Returns a deterministically-sorted, source-tagged list of frontmatter
 * records. Slug collisions between canonical and consumer are surfaced as a
 * separate `collisions` array — the caller decides how to merge or pick a
 * winner.
 *
 * NOTE: `parsedFrontmatter` is intentionally typed as `unknown` here. The
 * real schema lives in `src/content/schema.ts` (Task 1.2, runs in parallel).
 * Once that lands, Task 2.x will swap the stub `RawFrontmatter` type below
 * for the schema-validated record. Until then, the loader returns the raw
 * gray-matter object in both `rawFrontmatter` and `parsedFrontmatter` so the
 * shape stays stable for downstream callers writing tests against it.
 */
export type ContentKind = "rule" | "skill";
export type ContentSource = "canonical" | "consumer";
/**
 * Stub raw frontmatter type. Replaced with schema output in Task 2.x.
 */
type RawFrontmatter = Record<string, unknown>;
export interface ContentRecord {
    readonly kind: ContentKind;
    readonly slug: string;
    readonly source: ContentSource;
    readonly filePath: string;
    readonly rawFrontmatter: RawFrontmatter;
    readonly parsedFrontmatter: unknown;
    readonly body: string;
    readonly assetPaths: readonly string[];
}
export interface ContentCollision {
    readonly slug: string;
    readonly kind: ContentKind;
    readonly canonical: string;
    readonly consumer: string;
}
export interface LoadResult {
    readonly records: readonly ContentRecord[];
    readonly collisions: readonly ContentCollision[];
}
export interface LoadOptions {
    readonly catalogDir: string;
    readonly consumerRoot?: string;
    readonly kinds?: readonly ContentKind[];
}
export declare function loadContent(options: LoadOptions): LoadResult;
export {};
//# sourceMappingURL=loader.d.ts.map