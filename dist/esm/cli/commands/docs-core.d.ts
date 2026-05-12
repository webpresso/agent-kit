/**
 * Pure core for `ak docs lint` — no process.exit, no console.log.
 *
 * Reads markdown files, detects `doc-type: blueprint` frontmatter, runs
 * `validateBlueprintPlan`, and returns a structured result. All I/O is
 * injected for testability.
 */
export interface DocsLintResult {
    files: number;
    violations: Array<{
        file: string;
        message: string;
        rule: string;
    }>;
    exitCode: 0 | 1;
}
type ReadFileFn = (p: string) => Promise<string>;
type GlobFn = (pattern: string, options: {
    cwd: string;
}) => Promise<string[]>;
export declare function runDocsLint(target: string, deps?: {
    readFile?: ReadFileFn;
    glob?: GlobFn;
}): Promise<DocsLintResult>;
export {};
//# sourceMappingURL=docs-core.d.ts.map