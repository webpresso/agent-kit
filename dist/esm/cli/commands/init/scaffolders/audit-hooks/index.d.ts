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
 * Append the managed audit block to `.husky/pre-commit` if the audits are not
 * already present. Creates the file with a shebang if it does not exist.
 * Idempotent: re-running produces no change when the audits are present.
 */
export declare function scaffoldAuditHooks(input: ScaffoldAuditHooksInput): ScaffoldAuditHooksResult;
//# sourceMappingURL=index.d.ts.map