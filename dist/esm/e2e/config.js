import { z } from 'zod';
export const WEBPRESSO_CONFIG_FILE_NAME = 'webpresso.config.ts';
export const WEBPRESSO_CONFIG_EXPORT_NAME = 'webpressoConfig';
const e2eWebpressoConfigSchema = z
    .object({
    hostAdapterModule: z.string().min(1, 'e2e.hostAdapterModule must not be empty.'),
    hostAdapterExport: z.string().min(1, 'e2e.hostAdapterExport must not be empty.').optional(),
})
    .strict();
const webpressoConfigSchema = z
    .object({
    e2e: e2eWebpressoConfigSchema.optional(),
})
    .strict();
export class WebpressoConfigValidationError extends Error {
    configPath;
    issues;
    constructor(configPath, issues) {
        const formattedIssues = issues.map((issue) => `  - ${issue.path}: ${issue.message}`).join('\n');
        super(`Invalid webpresso config at ${configPath}:\n${formattedIssues}`);
        this.configPath = configPath;
        this.name = 'WebpressoConfigValidationError';
        this.issues = issues;
    }
}
export function defineWebpressoConfig(config) {
    return config;
}
export function validateWebpressoConfig(config, configPath) {
    const result = webpressoConfigSchema.safeParse(config);
    if (!result.success) {
        throw new WebpressoConfigValidationError(configPath, result.error.issues.map((issue) => ({
            path: issue.path.join('.') || '<root>',
            message: issue.message,
        })));
    }
    return result.data;
}
//# sourceMappingURL=config.js.map