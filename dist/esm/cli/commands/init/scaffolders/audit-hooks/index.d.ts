import type { MergeOptions } from '#cli/commands/init/merge';
export interface ScaffoldAuditHooksInput {
    repoRoot: string;
    options: MergeOptions;
}
export interface ScaffoldAuditHooksResult {
    preCommitPath: string;
    action: 'created' | 'appended' | 'identical' | 'skipped-dry';
}
/**
 * Append audit hook lines to `.husky/pre-commit` if not already present.
 * Creates the file with a shebang if it does not exist.
 * Idempotent: re-running produces no change when lines are present.
 */
export declare function scaffoldAuditHooks(input: ScaffoldAuditHooksInput): ScaffoldAuditHooksResult;
//# sourceMappingURL=index.d.ts.map