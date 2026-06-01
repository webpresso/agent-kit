import { z } from 'zod';
export declare const WEBPRESSO_CONFIG_FILE_NAME = "webpresso.config.ts";
export declare const WEBPRESSO_CONFIG_EXPORT_NAME = "webpressoConfig";
export declare const AGENT_KIT_CONFIG_FILE_NAME = "agent-kit.config.ts";
export declare const AGENT_KIT_CONFIG_EXPORT_NAME = "agentKitConfig";
export declare const WEBPRESSO_CONFIG_CANDIDATES: readonly [{
    readonly fileName: "agent-kit.config.ts";
    readonly exportName: "agentKitConfig";
}, {
    readonly fileName: "webpresso.config.ts";
    readonly exportName: "webpressoConfig";
}];
declare const webpressoConfigSchema: z.ZodObject<{
    e2e: z.ZodOptional<z.ZodObject<{
        hostAdapterModule: z.ZodString;
        hostAdapterExport: z.ZodOptional<z.ZodString>;
    }, z.core.$strict>>;
    deploy: z.ZodOptional<z.ZodObject<{
        cloudflare: z.ZodOptional<z.ZodObject<{
            lanes: z.ZodObject<{
                dev: z.ZodObject<{
                    wranglerEnvName: z.ZodString;
                }, z.core.$strict>;
                preview_main: z.ZodObject<{
                    wranglerEnvName: z.ZodString;
                }, z.core.$strict>;
                preview_pr: z.ZodObject<{
                    wranglerEnvNamePattern: z.ZodString;
                }, z.core.$strict>;
                prd: z.ZodObject<{
                    wranglerEnvName: z.ZodString & z.ZodType<"production", string, z.core.$ZodTypeInternals<"production", string>>;
                    deployedWorkerNameMode: z.ZodLiteral<"top_level_name">;
                }, z.core.$strict>;
            }, z.core.$strict>;
            production: z.ZodObject<{
                metadataPath: z.ZodLiteral<"infra/release-metadata.production.json">;
            }, z.core.$strict>;
            targets: z.ZodArray<z.ZodObject<{
                id: z.ZodString;
                type: z.ZodEnum<{
                    single_worker: "single_worker";
                    worker_plus_assets: "worker_plus_assets";
                    monorepo_multi_target: "monorepo_multi_target";
                }>;
                topLevelWorkerName: z.ZodString;
                previewTransport: z.ZodEnum<{
                    custom_domain_env: "custom_domain_env";
                    workers_dev_env: "workers_dev_env";
                }>;
                routeSpec: z.ZodOptional<z.ZodObject<{
                    pattern: z.ZodString;
                }, z.core.$strict>>;
                durableObjectBindings: z.ZodOptional<z.ZodArray<z.ZodObject<{
                    name: z.ZodString;
                    className: z.ZodString;
                    scriptName: z.ZodOptional<z.ZodString>;
                }, z.core.$strict>>>;
                vars: z.ZodRecord<z.ZodString, z.ZodUnknown>;
                requiredSecrets: z.ZodArray<z.ZodString>;
                storageMode: z.ZodEnum<{
                    isolated: "isolated";
                    shared_via_script_name: "shared_via_script_name";
                }>;
                destroyMode: z.ZodLiteral<"wrangler_delete_env">;
                repoCleanupHook: z.ZodOptional<z.ZodString>;
                blastRadiusDoc: z.ZodOptional<z.ZodString>;
                productionStrategyDefault: z.ZodEnum<{
                    direct: "direct";
                    gradual: "gradual";
                }>;
            }, z.core.$strict>>;
        }, z.core.$strict>>;
    }, z.core.$strict>>;
}, z.core.$strict>;
export type WebpressoConfig = z.infer<typeof webpressoConfigSchema>;
export type WebpressoE2eConfig = NonNullable<WebpressoConfig['e2e']>;
export declare class WebpressoConfigValidationError extends Error {
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
export declare function defineWebpressoConfig<TConfig extends WebpressoConfig>(config: TConfig): TConfig;
export declare function validateWebpressoConfig(config: unknown, configPath: string): WebpressoConfig;
export {};
//# sourceMappingURL=config.d.ts.map