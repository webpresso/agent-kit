/**
 * `ak docs lint <path>` — run the blueprint-plan validator over a markdown
 * file or directory.
 *
 * Walks the target path, runs `validateBlueprintPlan` on every `.md` file
 * with a frontmatter `doc-type: blueprint`, and prints a flat report.
 * Exits non-zero when any error-severity violation is found.
 */
import type { CAC } from 'cac';
export declare function registerDocsCommand(cli: CAC): void;
//# sourceMappingURL=docs.d.ts.map