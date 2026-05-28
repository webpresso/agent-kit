import { z } from 'zod';
export declare const WEBPRESSO_CONFIG_FILE_NAME = "webpresso.config.ts";
export declare const WEBPRESSO_CONFIG_EXPORT_NAME = "webpressoConfig";
declare const webpressoConfigSchema: z.ZodObject<{
    e2e: z.ZodOptional<z.ZodObject<{
        hostAdapterModule: z.ZodString;
        hostAdapterExport: z.ZodOptional<z.ZodString>;
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