export interface WorktreeCommandOptions {
    base?: string;
    path?: string;
    force?: boolean;
    cwd?: string;
}
export interface WorktreeEntry {
    path: string;
    head: string;
    branch: string | null;
    bare: boolean;
}
export declare function parseWorktreePorcelain(raw: string): WorktreeEntry[];
export declare function resolveWorktreePath(nameOrPath: string, entries: WorktreeEntry[]): string;
export declare function executeWorktreeSubcommand(subcommand: string, args: string[], opts: WorktreeCommandOptions): Promise<void>;
//# sourceMappingURL=router-dispatch.d.ts.map