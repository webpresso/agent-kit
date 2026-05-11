import { z } from 'zod';
export declare const AGENT_KIT_CONFIG_FILE_NAME = "agent-kit.config.ts";
export declare const AGENT_KIT_CONFIG_EXPORT_NAME = "agentKitConfig";
declare const agentKitConfigSchema: z.ZodObject<{
    e2e: z.ZodOptional<z.ZodObject<{
        hostAdapterModule: z.ZodString;
        hostAdapterExport: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type AgentKitConfig = z.infer<typeof agentKitConfigSchema>;
export type AgentKitE2eConfig = NonNullable<AgentKitConfig['e2e']>;
export declare class AgentKitConfigValidationError extends Error {
    readonly configPath: string;
    readonly issues: Array<{
        path: string;
        message: string;
    }>;
    constructor(configPath: string, issues: Array<{
        path: string;
        message: string;
    }>);
}
export declare function defineAgentKitConfig<TConfig extends AgentKitConfig>(config: TConfig): TConfig;
export declare function validateAgentKitConfig(config: unknown, configPath: string): AgentKitConfig;
export {};
//# sourceMappingURL=config.d.ts.map