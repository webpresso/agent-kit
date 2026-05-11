export declare const CONFIG_VERSION = "1";
export declare const CONFIG_FILENAME = ".agent-kitrc.json";
export declare const DEFAULT_DURABLE_PLANNING_ROOT = ".agent/planning/";
export interface AgentkitConfig {
    version: string;
    installed: {
        tier3Skills: string[];
    };
    mcp?: {
        serverName?: string;
        toolPrefix?: string;
    };
    rules: {
        overrides: string[];
    };
    scripts: {
        'setup-agent'?: string;
    };
    durablePlanningRoot: string;
    blueprintsDir?: string;
    lastInit?: string;
}
export declare function defaultConfig(): AgentkitConfig;
export declare function readConfig(repoRoot: string): AgentkitConfig | null;
export declare function mergeConfig(existing: AgentkitConfig | null, incoming: AgentkitConfig): AgentkitConfig;
export declare function writeConfig(repoRoot: string, config: AgentkitConfig): void;
//# sourceMappingURL=config.d.ts.map