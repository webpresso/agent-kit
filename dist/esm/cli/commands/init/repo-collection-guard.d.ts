export interface RepoCollectionRootDetection {
    readonly isCollectionRoot: boolean;
    readonly childNames: readonly string[];
    readonly reason: 'nested-git-roots' | 'unmarked-repo-children' | null;
}
export interface WebpressoPackageLike {
    readonly dependencies?: Record<string, string>;
    readonly devDependencies?: Record<string, string>;
}
export declare function detectRepoCollectionRoot(repoRoot: string): RepoCollectionRootDetection;
export declare function isInitializedWebpressoProject(repoRoot: string, packageJson: WebpressoPackageLike | null | undefined): boolean;
//# sourceMappingURL=repo-collection-guard.d.ts.map