import type { AgentHost, VisibilityStatus } from './host-visibility.js';
export declare const CONFIG_VERSION = "1";
export declare const CONFIG_FILENAME = ".webpressorc.json";
export declare const DEFAULT_DURABLE_PLANNING_ROOT = ".agent/planning/";
export interface AgentkitConfig {
    version: string;
    installed: {
        tier3Skills: string[];
    };
    hosts?: {
        selected: AgentHost[];
        requiredCapabilities: string[];
        visibility?: Record<string, Record<string, VisibilityStatus>>;
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
    /** True when webpresso is installed globally rather than as a devDep.
     *  Skips the devDependency presence check in `wp audit guardrails`. */
    globalInstall?: boolean;
}
export declare function defaultConfig(): AgentkitConfig;
export declare function readConfig(repoRoot: string): AgentkitConfig | null;
export declare function mergeConfig(existing: AgentkitConfig | null, incoming: AgentkitConfig): AgentkitConfig;
export declare function writeConfig(repoRoot: string, config: AgentkitConfig): void;
//# sourceMappingURL=config.d.ts.map