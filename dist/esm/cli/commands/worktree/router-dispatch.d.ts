import { type ManagedWorktreeEntry } from '#worktrees/registry.js';
export interface WorktreeCommandOptions {
    all?: boolean;
    base?: string;
    path?: string;
    name?: string;
    prefix?: string;
    dryRun?: boolean;
    force?: boolean;
    cwd?: string;
    repo?: string;
}
export interface WorktreeEntry {
    path: string;
    head: string;
    branch: string | null;
    bare: boolean;
}
export interface NewWorktreeTarget {
    branch: string;
    path: string;
    generated: boolean;
}
export interface NewWorktreeTargetInput {
    branch?: string;
    name?: string;
    prefix?: string;
    explicitPath?: string;
    repoRoot: string;
    now?: Date;
    randomSuffix?: () => string;
    existingEntries?: WorktreeEntry[];
    branchExists?: (branch: string) => boolean;
    pathExists?: (path: string) => boolean;
}
export declare function parseWorktreePorcelain(raw: string): WorktreeEntry[];
export declare function sanitizeWorktreeSegment(value: string, fallback?: string): string;
export declare function resolveNewWorktreeTarget(input: NewWorktreeTargetInput): NewWorktreeTarget;
export declare function resolveWorktreePath(nameOrPath: string, entries: WorktreeEntry[]): string;
export declare function formatWorktreeList(entries: WorktreeEntry[], currentWorktreePath: string): string[];
export declare function formatManagedWorktreeList(entries: readonly ManagedWorktreeEntry[]): string[];
export declare function executeWorktreeSubcommand(subcommand: string, args: string[], opts: WorktreeCommandOptions): Promise<void>;
//# sourceMappingURL=router-dispatch.d.ts.map