import type { AgentHost, VisibilityStatus } from './host-visibility.js';
export declare const CONFIG_VERSION = "1";
export declare const CONFIG_FILENAME = ".webpressorc.json";
export declare const LEGACY_CONFIG_FILENAME = ".agent-kitrc.json";
export declare const DEFAULT_DURABLE_PLANNING_ROOT = ".agent/planning/";
export declare const EXTERNAL_INTEGRATIONS: readonly ["omx", "omc", "gstack"];
export type ExternalIntegrationName = (typeof EXTERNAL_INTEGRATIONS)[number];
export type ExternalIntegrationScope = 'user' | 'project';
export interface ExternalIntegrationConfig {
    enabled: true;
    scope?: ExternalIntegrationScope;
}
export interface AgentkitConfig {
    version: string;
    installed: {
        tier3Skills: string[];
    };
    integrations?: Partial<Record<ExternalIntegrationName, ExternalIntegrationConfig>>;
    audit?: {
        toolchainIsolation?: {
            allowDependencies?: string[];
        };
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
    /** Pretool-guard routing policy. `mechanism` lives in agent-kit; this is the
     *  per-repo `data`. `scriptRoutes` maps a package-script name (e.g.
     *  `docs:check`) to a `wp_audit` kind; `packageManager: 'vp-only'` opts into
     *  routing all raw `pnpm`/`npm` invocations to the `vp` facade. */
    guard?: {
        packageManager?: 'vp-only';
        scriptRoutes?: Record<string, string>;
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