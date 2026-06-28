import { type ManagedWorktreeEntry, type RegistryOptions } from "./registry.js";
export interface WorktreeManagerOptions extends RegistryOptions {
    readonly dryRun?: boolean;
}
export interface OwnerBinding {
    readonly id: string;
    readonly branch: string;
    readonly path: string;
    readonly repoNamespace: string;
    readonly repoOriginUrl?: string;
}
export declare function readRepoOriginUrl(repoRoot: string): string | null;
export declare function ownerWorktreeId(repoNamespace: string, slug: string): string;
export declare function scratchWorktreeId(repoNamespace: string, slug: string, lane: string, id: string): string;
export declare function resolveOwnerBinding(repoRoot: string, slug: string): OwnerBinding;
export declare function ensureBlueprintOwnerWorktree(repoRoot: string, slug: string, options?: WorktreeManagerOptions): OwnerBinding;
export declare function adoptBlueprintOwnerWorktree(repoRoot: string, slug: string, worktreePath: string, options?: WorktreeManagerOptions): OwnerBinding;
export declare function clearBlueprintWorktreeOwnership(repoRoot: string, slug: string, options?: WorktreeManagerOptions): ManagedWorktreeEntry[];
export declare function createScratchWorktreeEntry(repoRoot: string, slug: string, lane: string, id: string, options?: WorktreeManagerOptions): ManagedWorktreeEntry;
export declare function findResolvableOwnerBinding(ownerId: string): ManagedWorktreeEntry | null;
export declare function managedRoot(): string;
export declare function repoManagedRoot(repoRoot: string): string;
export declare function listRegisteredWorktrees(): ManagedWorktreeEntry[];
//# sourceMappingURL=manager.d.ts.map