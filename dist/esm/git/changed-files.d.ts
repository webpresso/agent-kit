export type ChangedFilesReason = "ok" | "empty" | "not-a-repo" | "git-error" | "missing-base-ref" | "git-unavailable";
export interface ChangedFilesResult {
    readonly files: string[];
    readonly degraded: boolean;
    readonly reason: ChangedFilesReason;
}
export declare function defaultBranchBaseRef(env?: NodeJS.ProcessEnv): string;
export declare function getGitTopLevel(cwd?: string): string | null;
export declare function getStagedFiles(cwd?: string): ChangedFilesResult;
export declare function getBranchChangedFiles(cwd?: string, base?: string): ChangedFilesResult;
//# sourceMappingURL=changed-files.d.ts.map