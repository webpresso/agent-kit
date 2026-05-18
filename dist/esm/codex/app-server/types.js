import { z } from 'zod';
// Official app-server protocol reference:
// https://developers.openai.com/codex/app-server/
// https://github.com/openai/codex/blob/main/codex-rs/app-server/README.md
// Generated upstream Rust/TS source of truth:
// https://github.com/openai/codex/blob/main/codex-rs/app-server-protocol/src/protocol/v2.rs
const JsonValueSchema = z.lazy(() => z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    z.record(z.string(), JsonValueSchema),
]));
export const HookEventNameSchema = z.string().min(1).transform((value) => {
    switch (value) {
        case 'preToolUse':
            return 'pre_tool_use';
        case 'permissionRequest':
            return 'permission_request';
        case 'postToolUse':
            return 'post_tool_use';
        case 'sessionStart':
            return 'session_start';
        case 'userPromptSubmit':
            return 'user_prompt_submit';
        default:
            return value;
    }
});
export const HookHandlerTypeSchema = z.enum(['command', 'prompt', 'agent']);
export const HookSourceSchema = z.enum([
    'system',
    'user',
    'project',
    'mdm',
    'sessionFlags',
    'plugin',
    'cloudRequirements',
    'legacyManagedConfigFile',
    'legacyManagedConfigMdm',
    'unknown',
]);
export const HookTrustStatusSchema = z.enum(['managed', 'untrusted', 'trusted', 'modified']);
export const HookMetadataSchema = z.object({
    key: z.string().min(1),
    eventName: HookEventNameSchema,
    handlerType: HookHandlerTypeSchema,
    matcher: z.string().nullable(),
    command: z.string().nullable(),
    timeoutSec: z.number(),
    statusMessage: z.string().nullable(),
    sourcePath: z.string().min(1),
    source: HookSourceSchema,
    pluginId: z.string().nullable(),
    displayOrder: z.number(),
    enabled: z.boolean(),
    isManaged: z.boolean(),
    currentHash: z.string().min(1),
    trustStatus: HookTrustStatusSchema,
});
export const CommandHookMetadataSchema = HookMetadataSchema.extend({
    handlerType: z.literal('command'),
    command: z.string().min(1),
});
export const HooksListEntrySchema = z.object({
    cwd: z.string().min(1),
    hooks: z.array(HookMetadataSchema),
    warnings: z.array(z.string()),
    errors: z.array(z.object({ path: z.string(), message: z.string() }).or(z.string())),
});
export const HooksListResponseSchema = z.object({
    data: z.array(HooksListEntrySchema),
});
export const MergeStrategySchema = z.enum(['replace', 'merge', 'upsert']);
export const ConfigEditSchema = z.object({
    keyPath: z.string().min(1),
    value: JsonValueSchema,
    mergeStrategy: MergeStrategySchema,
});
export const ConfigBatchWriteParamsSchema = z.object({
    edits: z.array(ConfigEditSchema),
    filePath: z.string().nullable().optional(),
    expectedVersion: z.number().nullable().optional(),
    reloadUserConfig: z.boolean().default(false),
});
export const ConfigBatchWriteResponseSchema = z.object({}).passthrough();
export const JsonRpcErrorSchema = z.object({
    code: z.number(),
    message: z.string(),
    data: JsonValueSchema.optional(),
});
export function parseCommandHookMetadata(value) {
    const parsed = CommandHookMetadataSchema.safeParse(value);
    if (!parsed.success) {
        throw new Error('Expected command hook metadata');
    }
    return parsed.data;
}
//# sourceMappingURL=types.js.map