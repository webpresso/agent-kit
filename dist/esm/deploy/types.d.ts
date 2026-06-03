export type DeployLane = 'dev' | 'preview_main' | `preview_pr_${number}` | 'prd';
export type DeployStep = {
    readonly kind: 'command';
    readonly id: string;
    readonly label?: string;
    readonly command: string;
    readonly args?: readonly string[];
    readonly cwd?: string;
    readonly env?: Readonly<Record<string, string | undefined>>;
} | {
    readonly kind: 'managed-tool';
    readonly id: string;
    readonly label?: string;
    readonly tool: string;
    readonly args?: readonly string[];
    readonly cwd?: string;
    readonly env?: Readonly<Record<string, string | undefined>>;
};
export interface DeployPlan {
    readonly schemaVersion: 1;
    readonly lane: DeployLane;
    readonly provider: string;
    readonly requiredCredentials: readonly string[];
    readonly steps: readonly DeployStep[];
}
export interface DeployRequest {
    readonly cwd: string;
    readonly lane: DeployLane;
    readonly dryRun: boolean;
    readonly env: NodeJS.ProcessEnv;
    readonly cloudflare?: unknown;
}
export interface DeployAdapter {
    readonly createPlan: (request: DeployRequest) => DeployPlan | Promise<DeployPlan>;
}
export interface LoadedDeployAdapter {
    readonly adapter: DeployAdapter;
    readonly config: import('#e2e/config.js').WebpressoConfig;
    readonly configPath: string;
    readonly moduleSpecifier: string;
    readonly exportName: string;
}
//# sourceMappingURL=types.d.ts.map