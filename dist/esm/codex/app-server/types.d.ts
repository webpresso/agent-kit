import { z } from 'zod';
export declare const HookEventNameSchema: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
export declare const HookHandlerTypeSchema: z.ZodEnum<{
    command: "command";
    agent: "agent";
    prompt: "prompt";
}>;
export declare const HookSourceSchema: z.ZodEnum<{
    project: "project";
    unknown: "unknown";
    system: "system";
    user: "user";
    plugin: "plugin";
    mdm: "mdm";
    sessionFlags: "sessionFlags";
    cloudRequirements: "cloudRequirements";
    legacyManagedConfigFile: "legacyManagedConfigFile";
    legacyManagedConfigMdm: "legacyManagedConfigMdm";
}>;
export declare const HookTrustStatusSchema: z.ZodEnum<{
    managed: "managed";
    untrusted: "untrusted";
    trusted: "trusted";
    modified: "modified";
}>;
export declare const HookMetadataSchema: z.ZodObject<{
    key: z.ZodString;
    eventName: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    handlerType: z.ZodEnum<{
        command: "command";
        agent: "agent";
        prompt: "prompt";
    }>;
    matcher: z.ZodNullable<z.ZodString>;
    command: z.ZodNullable<z.ZodString>;
    timeoutSec: z.ZodNumber;
    statusMessage: z.ZodNullable<z.ZodString>;
    sourcePath: z.ZodString;
    source: z.ZodEnum<{
        project: "project";
        unknown: "unknown";
        system: "system";
        user: "user";
        plugin: "plugin";
        mdm: "mdm";
        sessionFlags: "sessionFlags";
        cloudRequirements: "cloudRequirements";
        legacyManagedConfigFile: "legacyManagedConfigFile";
        legacyManagedConfigMdm: "legacyManagedConfigMdm";
    }>;
    pluginId: z.ZodNullable<z.ZodString>;
    displayOrder: z.ZodNumber;
    enabled: z.ZodBoolean;
    isManaged: z.ZodBoolean;
    currentHash: z.ZodString;
    trustStatus: z.ZodEnum<{
        managed: "managed";
        untrusted: "untrusted";
        trusted: "trusted";
        modified: "modified";
    }>;
}, z.core.$strip>;
export declare const CommandHookMetadataSchema: z.ZodObject<{
    key: z.ZodString;
    eventName: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
    matcher: z.ZodNullable<z.ZodString>;
    timeoutSec: z.ZodNumber;
    statusMessage: z.ZodNullable<z.ZodString>;
    sourcePath: z.ZodString;
    source: z.ZodEnum<{
        project: "project";
        unknown: "unknown";
        system: "system";
        user: "user";
        plugin: "plugin";
        mdm: "mdm";
        sessionFlags: "sessionFlags";
        cloudRequirements: "cloudRequirements";
        legacyManagedConfigFile: "legacyManagedConfigFile";
        legacyManagedConfigMdm: "legacyManagedConfigMdm";
    }>;
    pluginId: z.ZodNullable<z.ZodString>;
    displayOrder: z.ZodNumber;
    enabled: z.ZodBoolean;
    isManaged: z.ZodBoolean;
    currentHash: z.ZodString;
    trustStatus: z.ZodEnum<{
        managed: "managed";
        untrusted: "untrusted";
        trusted: "trusted";
        modified: "modified";
    }>;
    handlerType: z.ZodLiteral<"command">;
    command: z.ZodString;
}, z.core.$strip>;
export declare const HooksListEntrySchema: z.ZodObject<{
    cwd: z.ZodString;
    hooks: z.ZodArray<z.ZodObject<{
        key: z.ZodString;
        eventName: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
        handlerType: z.ZodEnum<{
            command: "command";
            agent: "agent";
            prompt: "prompt";
        }>;
        matcher: z.ZodNullable<z.ZodString>;
        command: z.ZodNullable<z.ZodString>;
        timeoutSec: z.ZodNumber;
        statusMessage: z.ZodNullable<z.ZodString>;
        sourcePath: z.ZodString;
        source: z.ZodEnum<{
            project: "project";
            unknown: "unknown";
            system: "system";
            user: "user";
            plugin: "plugin";
            mdm: "mdm";
            sessionFlags: "sessionFlags";
            cloudRequirements: "cloudRequirements";
            legacyManagedConfigFile: "legacyManagedConfigFile";
            legacyManagedConfigMdm: "legacyManagedConfigMdm";
        }>;
        pluginId: z.ZodNullable<z.ZodString>;
        displayOrder: z.ZodNumber;
        enabled: z.ZodBoolean;
        isManaged: z.ZodBoolean;
        currentHash: z.ZodString;
        trustStatus: z.ZodEnum<{
            managed: "managed";
            untrusted: "untrusted";
            trusted: "trusted";
            modified: "modified";
        }>;
    }, z.core.$strip>>;
    warnings: z.ZodArray<z.ZodString>;
    errors: z.ZodArray<z.ZodUnion<[z.ZodObject<{
        path: z.ZodString;
        message: z.ZodString;
    }, z.core.$strip>, z.ZodString]>>;
}, z.core.$strip>;
export declare const HooksListResponseSchema: z.ZodObject<{
    data: z.ZodArray<z.ZodObject<{
        cwd: z.ZodString;
        hooks: z.ZodArray<z.ZodObject<{
            key: z.ZodString;
            eventName: z.ZodPipe<z.ZodString, z.ZodTransform<string, string>>;
            handlerType: z.ZodEnum<{
                command: "command";
                agent: "agent";
                prompt: "prompt";
            }>;
            matcher: z.ZodNullable<z.ZodString>;
            command: z.ZodNullable<z.ZodString>;
            timeoutSec: z.ZodNumber;
            statusMessage: z.ZodNullable<z.ZodString>;
            sourcePath: z.ZodString;
            source: z.ZodEnum<{
                project: "project";
                unknown: "unknown";
                system: "system";
                user: "user";
                plugin: "plugin";
                mdm: "mdm";
                sessionFlags: "sessionFlags";
                cloudRequirements: "cloudRequirements";
                legacyManagedConfigFile: "legacyManagedConfigFile";
                legacyManagedConfigMdm: "legacyManagedConfigMdm";
            }>;
            pluginId: z.ZodNullable<z.ZodString>;
            displayOrder: z.ZodNumber;
            enabled: z.ZodBoolean;
            isManaged: z.ZodBoolean;
            currentHash: z.ZodString;
            trustStatus: z.ZodEnum<{
                managed: "managed";
                untrusted: "untrusted";
                trusted: "trusted";
                modified: "modified";
            }>;
        }, z.core.$strip>>;
        warnings: z.ZodArray<z.ZodString>;
        errors: z.ZodArray<z.ZodUnion<[z.ZodObject<{
            path: z.ZodString;
            message: z.ZodString;
        }, z.core.$strip>, z.ZodString]>>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const MergeStrategySchema: z.ZodEnum<{
    replace: "replace";
    merge: "merge";
    upsert: "upsert";
}>;
export declare const ConfigEditSchema: z.ZodObject<{
    keyPath: z.ZodString;
    value: z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
    mergeStrategy: z.ZodEnum<{
        replace: "replace";
        merge: "merge";
        upsert: "upsert";
    }>;
}, z.core.$strip>;
export declare const ConfigBatchWriteParamsSchema: z.ZodObject<{
    edits: z.ZodArray<z.ZodObject<{
        keyPath: z.ZodString;
        value: z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>;
        mergeStrategy: z.ZodEnum<{
            replace: "replace";
            merge: "merge";
            upsert: "upsert";
        }>;
    }, z.core.$strip>>;
    filePath: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    expectedVersion: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    reloadUserConfig: z.ZodDefault<z.ZodBoolean>;
}, z.core.$strip>;
export declare const ConfigBatchWriteResponseSchema: z.ZodObject<{}, z.core.$loose>;
export declare const JsonRpcErrorSchema: z.ZodObject<{
    code: z.ZodNumber;
    message: z.ZodString;
    data: z.ZodOptional<z.ZodType<unknown, unknown, z.core.$ZodTypeInternals<unknown, unknown>>>;
}, z.core.$strip>;
export type HookEventName = z.infer<typeof HookEventNameSchema>;
export type HookHandlerType = z.infer<typeof HookHandlerTypeSchema>;
export type HookSource = z.infer<typeof HookSourceSchema>;
export type HookTrustStatus = z.infer<typeof HookTrustStatusSchema>;
export type HookMetadata = z.infer<typeof HookMetadataSchema>;
export type CommandHookMetadata = z.infer<typeof CommandHookMetadataSchema>;
export type HooksListEntry = z.infer<typeof HooksListEntrySchema>;
export type HooksListResponse = z.infer<typeof HooksListResponseSchema>;
export type ConfigEdit = z.infer<typeof ConfigEditSchema>;
export type ConfigBatchWriteParams = z.infer<typeof ConfigBatchWriteParamsSchema>;
export type ConfigBatchWriteResponse = z.infer<typeof ConfigBatchWriteResponseSchema>;
export type JsonRpcError = z.infer<typeof JsonRpcErrorSchema>;
export interface CodexAppServerApi {
    hooksList(cwds: string[]): Promise<HooksListResponse>;
    configBatchWrite(params: ConfigBatchWriteParams): Promise<ConfigBatchWriteResponse>;
    close(): Promise<void> | void;
}
export declare function parseCommandHookMetadata(value: unknown): CommandHookMetadata;
//# sourceMappingURL=types.d.ts.map