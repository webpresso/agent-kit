export type ManagedWorktreeKind = 'owner' | 'scratch';
export interface ManagedWorktreeEntry {
    readonly id: string;
    readonly repoNamespace: string;
    readonly repoRoot: string;
    readonly repoOriginUrl?: string;
    readonly kind: ManagedWorktreeKind;
    readonly path: string;
    readonly branch?: string;
    readonly detached?: boolean;
    readonly blueprintSlug?: string;
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly lastSeenAt?: string;
}
export interface WorktreeRegistry {
    readonly version: 1;
    readonly entries: ManagedWorktreeEntry[];
}
export interface RegistryOptions {
    readonly root?: string;
    readonly now?: () => string;
}
export declare function readWorktreeRegistry(options?: RegistryOptions): WorktreeRegistry;
export declare function writeWorktreeRegistry(registry: WorktreeRegistry, options?: RegistryOptions): void;
export declare function upsertWorktreeRegistryEntry(entry: Omit<ManagedWorktreeEntry, 'createdAt' | 'updatedAt'> & {
    readonly createdAt?: string;
    readonly updatedAt?: string;
}, options?: RegistryOptions): ManagedWorktreeEntry;
export declare function removeWorktreeRegistryEntries(predicate: (entry: ManagedWorktreeEntry) => boolean, options?: RegistryOptions): ManagedWorktreeEntry[];
export declare function pruneStaleWorktreeRegistryEntries(options?: RegistryOptions): {
    kept: ManagedWorktreeEntry[];
    removed: ManagedWorktreeEntry[];
};
export declare function findWorktreeRegistryEntry(id: string, options?: RegistryOptions): ManagedWorktreeEntry | null;
//# sourceMappingURL=registry.d.ts.map