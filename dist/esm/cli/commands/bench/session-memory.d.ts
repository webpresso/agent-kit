type Manifest = {
    bun: string;
    claude: string;
    node: string;
    model: string;
    plugins: {
        main: string;
        v1: string;
        v2: string;
    };
};
type Usage = {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens: number;
    cache_read_input_tokens: number;
    duration_ms: number;
};
type RunResult = {
    ok: true;
    usage: Usage;
    tools: string[];
    transcript_path: string;
    home_dir: string;
} | {
    ok: false;
    error: 'rate_limit' | 'spawn_failed';
    usage: null;
    tools: [];
    transcript_path: null;
    home_dir: string;
};
type Scenario = {
    scenario_id: string;
    description: string;
    worst_case_token_count: number;
    prompt_turns: Array<{
        session_id: string;
        turn_idx: number;
        role: 'user' | 'assistant';
        text: string;
        estimated_tokens: number;
    }>;
    expected_tool_calls: string[];
    qrels: Array<{
        question: string;
        expected_substring_in_response: string;
    }>;
};
type WorkspaceConfig = {
    mode: 'isolated' | 'single-workspace';
    cacheDisclaimer: string | null;
    keyEnvNames: string[];
    adminVerification: 'required-for-proof' | 'operator-asserted' | 'not-applicable';
};
type WorkspaceIdentity = {
    workspaceId: string;
    apiKeyEnv: string;
};
type CostSummary = {
    mean: number;
    std: number;
    n: number;
    total: number;
};
type SessionMemoryReport = {
    run_id: string;
    model: string;
    dry_run: boolean;
    cache_disclaimer: string | null;
    cells: Array<{
        scenario_id: string;
        variant: string;
        trials: number;
        status: 'ok' | 'rate_limit' | 'spawn_failed';
        cost_usd: number;
        recall_at_5: number;
        wall_sec: number;
    }>;
};
export type RunBenchSessionMemoryInput = {
    allVariants?: boolean;
    cwd?: string;
    dryRun?: boolean;
    env?: NodeJS.ProcessEnv;
    model?: string;
    outputRoot?: string;
    scenario?: string;
    trials?: number;
    variant?: string;
};
export type RunBenchSessionMemoryResult = {
    exitCode: number;
    runId: string;
    dryRun: boolean;
    reportPath: string | null;
    cellCount: number;
};
type RuntimeModules = {
    aggregateCosts: (usages: Usage[], pricing: unknown, model: string) => CostSummary;
    captureManifest: () => Promise<Manifest>;
    loadAllScenarios: () => Scenario[];
    loadManifest: () => Manifest;
    loadPricing: () => unknown;
    resolveWorkspaceConfig: (env?: NodeJS.ProcessEnv) => WorkspaceConfig;
    resolveWorkspaceIdentitiesFromEnv: (env?: NodeJS.ProcessEnv) => WorkspaceIdentity[];
    runCell: (input: {
        scenario: string;
        prompt: string;
        variant: string;
        trial: number;
        pluginDir: string;
        runId?: string;
        cwd?: string;
        outputRoot?: string;
        apiKeys?: Record<string, string | undefined>;
    }) => Promise<RunResult>;
    validateKnownAnthropicWorkspaces: (identities: WorkspaceIdentity[], adminKey: string) => Promise<void>;
    validateWorkspaceKeyPresence: (config: WorkspaceConfig, env?: NodeJS.ProcessEnv) => void;
    verifyManifest: (captured: Manifest, pinned: Manifest) => void;
    writeReport: (report: SessionMemoryReport, outPath: string) => void;
};
export type RunBenchSessionMemoryDeps = RuntimeModules;
export declare function isBunSingleFileUrl(fromUrl: string): boolean;
export declare function resolveRepoRoot(fromUrl: string, fallbackRoot?: string): string;
export declare function assertBenchRuntimeAssets(repoRoot: string): void;
export declare function resolveBenchRuntimeRoot(fromUrl?: string, fallbackRoot?: string): string;
export declare function assertBenchSessionMemorySupportedRuntime(env?: NodeJS.ProcessEnv): void;
export declare function createRunId(manifest: Manifest): string;
export declare function runBenchSessionMemoryCommand(input: RunBenchSessionMemoryInput, deps?: RunBenchSessionMemoryDeps): Promise<RunBenchSessionMemoryResult>;
export {};
//# sourceMappingURL=session-memory.d.ts.map