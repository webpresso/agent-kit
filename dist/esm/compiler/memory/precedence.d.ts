export interface ParsedSection {
    readonly slug: string;
    readonly heading: string;
    readonly content: string;
}
export interface ParsedDocument {
    readonly frontmatter: Readonly<Record<string, unknown>>;
    readonly sections: readonly ParsedSection[];
}
export declare function parseDocument(fileContent: string): ParsedDocument;
export declare function serializeDocument(frontmatter: Readonly<Record<string, unknown>>, sections: ReadonlyMap<string, {
    heading: string;
    content: string;
}>): string;
//# sourceMappingURL=precedence.d.ts.map