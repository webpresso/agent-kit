export declare const AGENT_KIT_PACKAGE_NAME = "@webpresso/agent-kit";
export declare function isAgentKitSourceRepo(repoRoot: string): boolean;
export declare function sourceRepoHooksMustForceSource(repoRoot: string): boolean;
export declare function hookCommandEnvPrefix(repoRoot: string): string;
export declare function setupCommandForHookPolicy(repoRoot: string, options?: {
    readonly restoreHooks?: boolean;
}): string;
//# sourceMappingURL=source-repo-hook-policy.d.ts.map