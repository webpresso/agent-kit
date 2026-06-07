/**
 * Docs-linter validation error type.
 *
 * Inlined subset of the upstream docs-linter `types.ts` — only the
 * `ValidationError` interface is needed by the blueprint-plan validator.
 */
export interface ValidationError {
    file: string;
    line?: number;
    column?: number;
    severity: 'error' | 'warning';
    source: 'schema' | 'markdownlint' | 'vale' | 'structure' | 'context-limits' | 'blueprint-format';
    message: string;
    ruleId?: string;
}
//# sourceMappingURL=types.d.ts.map