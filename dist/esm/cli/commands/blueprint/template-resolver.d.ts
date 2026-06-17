export type TemplateEntry = {
    name: string;
    path: string;
};
/**
 * List available templates from `templatesDir` (defaults to docs/templates/).
 *
 * Only `.md` files are returned; names are deduplicated so that both
 * `blueprint.md` and `blueprint.yaml` produce a single entry named "blueprint".
 * Each entry carries the absolute path to the `.md` file.
 */
export declare function listTemplates(templatesDir?: string): readonly TemplateEntry[];
/**
 * Resolve the absolute path to the `.md` template file for `name`.
 *
 * Returns `null` if no matching template exists in `templatesDir`.
 */
export declare function resolveTemplate(name: string, templatesDir?: string): string | null;
//# sourceMappingURL=template-resolver.d.ts.map