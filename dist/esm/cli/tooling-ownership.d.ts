export declare const TOOLING_OWNERSHIP_FILENAME = "tooling-ownership.json";
export declare const MANAGED_TOOL_NAMES: readonly ["omx", "omc", "gstack"];
export type ManagedToolName = (typeof MANAGED_TOOL_NAMES)[number];
export interface ToolingOwnershipRecord {
    readonly managedBy: 'wp';
}
export interface ToolingOwnershipEntry {
    readonly user?: ToolingOwnershipRecord;
    readonly projects?: readonly string[];
}
export interface ToolingOwnershipState {
    readonly version: 1;
    readonly tools: Partial<Record<ManagedToolName, ToolingOwnershipEntry>>;
}
export declare function defaultToolingOwnershipState(): ToolingOwnershipState;
export declare function normalizeToolingOwnershipState(parsed: unknown): ToolingOwnershipState;
export declare function defaultToolingOwnershipPath(): string;
export declare function readToolingOwnershipState(path?: string): ToolingOwnershipState;
export declare function writeToolingOwnershipState(state: ToolingOwnershipState, path?: string): void;
export declare function claimUserOwnedTool(state: ToolingOwnershipState, tool: ManagedToolName): ToolingOwnershipState;
export declare function claimProjectOwnedTool(state: ToolingOwnershipState, tool: Extract<ManagedToolName, 'omx' | 'omc'>, repoKey: string): ToolingOwnershipState;
export declare function clearProjectOwnedTool(state: ToolingOwnershipState, tool: Extract<ManagedToolName, 'omx' | 'omc'>, repoKey: string): ToolingOwnershipState;
export declare function isUserOwnedTool(state: ToolingOwnershipState, tool: ManagedToolName): boolean;
export declare function isProjectOwnedTool(state: ToolingOwnershipState, tool: Extract<ManagedToolName, 'omx' | 'omc'>, repoKey: string | null): boolean;
export declare function hasAnyOwnership(state: ToolingOwnershipState, tool: ManagedToolName): boolean;
export declare function tryReadRepoKey(cwd: string, getSurfaceRepoPath?: (name: string, scope: 'repo', cwd: string) => string): string | null;
export declare function toolingOwnershipFileExists(path?: string): boolean;
//# sourceMappingURL=tooling-ownership.d.ts.map