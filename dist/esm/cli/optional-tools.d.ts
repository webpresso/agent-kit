import type { SpawnSyncReturns } from "node:child_process";
import { type ManagedToolName, type ToolingOwnershipState } from "#cli/tooling-ownership.js";
import { type GlobalCapableVpCommandInput } from "#cli/global-vp.js";
export type OptionalToolScope = "user" | "project";
export type OptionalToolNamespace = "base" | "oh-my";
export interface OptionalToolCommandStep {
    readonly id: string;
    readonly command: string;
    readonly args: readonly string[];
    readonly cwd?: string;
    readonly optional?: boolean;
}
export interface OptionalToolCommandContext {
    readonly scope: OptionalToolScope;
    readonly vpCommand: GlobalCapableVpCommandInput;
    readonly cwd: string;
}
export interface OptionalToolUpdateContext {
    readonly ownershipState: ToolingOwnershipState;
    readonly repoKey: string | null;
    readonly vpCommand: GlobalCapableVpCommandInput;
    readonly cwd: string;
}
export interface OptionalToolAdapter {
    readonly id: ManagedToolName;
    readonly namespace: OptionalToolNamespace;
    readonly canonicalName: string;
    readonly aliases: readonly string[];
    readonly supportedScopes: readonly OptionalToolScope[];
    readonly ownershipName: string;
    readonly install: (context: OptionalToolCommandContext) => readonly OptionalToolCommandStep[];
    readonly update: (context: OptionalToolUpdateContext) => readonly OptionalToolCommandStep[];
}
export type ResolvedOptionalTool = {
    readonly adapter: OptionalToolAdapter;
    readonly alias: string;
};
export type ParsedOptionalToolArgs = {
    readonly kind: "ok";
    readonly scope: OptionalToolScope;
} | {
    readonly kind: "error";
    readonly message: string;
};
export type OptionalToolResolution = {
    readonly kind: "none";
} | {
    readonly kind: "error";
    readonly message: string;
} | {
    readonly kind: "matched";
    readonly adapter: OptionalToolAdapter;
    readonly alias: string;
    readonly scope: OptionalToolScope;
};
export declare const OPTIONAL_TOOL_ADAPTERS: readonly OptionalToolAdapter[];
export declare function optionalToolCanonicalCommand(adapter: OptionalToolAdapter): string;
export declare function optionalToolCanonicalRemoveCommand(adapter: OptionalToolAdapter): string;
export declare function optionalToolUsageExamples(): string;
export declare function resolveOptionalTool(namespace: OptionalToolNamespace, name: string): ResolvedOptionalTool | null;
export declare function parseOptionalToolScopeArgs(args: readonly string[], adapter: OptionalToolAdapter): ParsedOptionalToolArgs;
export declare function parseOptionalToolCommandArgs(args: readonly string[]): OptionalToolResolution;
export declare function claimOptionalToolOwnership(state: ToolingOwnershipState, adapter: OptionalToolAdapter, scope: OptionalToolScope, repoKey: string | null): ToolingOwnershipState | {
    readonly error: string;
};
export declare function clearOptionalToolOwnership(state: ToolingOwnershipState, adapter: OptionalToolAdapter, scope: OptionalToolScope, repoKey: string | null): ToolingOwnershipState | {
    readonly error: string;
};
export declare function optionalToolUpdateSteps(context: OptionalToolUpdateContext): readonly OptionalToolCommandStep[];
export declare function formatOptionalToolInstallSuccess(adapter: OptionalToolAdapter, scope: OptionalToolScope): string;
export declare function formatOptionalToolRemoveSuccess(adapter: OptionalToolAdapter, scope: OptionalToolScope): string;
export declare function spawnResultStatus(result: SpawnSyncReturns<string>): number;
//# sourceMappingURL=optional-tools.d.ts.map