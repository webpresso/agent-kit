import { isBuiltInProviderType } from '#secrets/providers/registry.js';
import { SECRET_SINK_NAMES, SECRET_SINK_OPERATIONS, } from '#secrets/sinks/types.js';
function assertRecord(value, detail) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error(detail);
    }
    return value;
}
function assertNonEmptyString(value, detail) {
    if (typeof value !== 'string' || value.trim().length === 0) {
        throw new Error(detail);
    }
    return value;
}
function parseProviderConfig(providerId, value) {
    const record = assertRecord(value, `Provider "${providerId}" must be an object.`);
    const type = record.type;
    if (!isBuiltInProviderType(type)) {
        throw new Error(`Unsupported secret provider "${String(type)}" for "${providerId}".`);
    }
    switch (type) {
        case 'doppler':
            return {
                type: 'doppler',
                ...(typeof record.workspace === 'string' && record.workspace.trim().length > 0
                    ? { workspace: record.workspace }
                    : {}),
                ...(typeof record.workspaceId === 'string' && record.workspaceId.trim().length > 0
                    ? { workspaceId: record.workspaceId }
                    : {}),
                project: assertNonEmptyString(record.project, `Provider "${providerId}" requires a non-empty project.`),
            };
        case 'infisical':
            if ((typeof record.projectId !== 'string' || record.projectId.trim().length === 0) &&
                (typeof record.project !== 'string' || record.project.trim().length === 0)) {
                throw new Error(`Provider "${providerId}" requires a non-empty projectId or project.`);
            }
            return {
                type: 'infisical',
                ...(typeof record.project === 'string' && record.project.trim().length > 0
                    ? { project: record.project }
                    : {}),
                ...(typeof record.projectId === 'string' && record.projectId.trim().length > 0
                    ? { projectId: record.projectId }
                    : {}),
                ...(typeof record.identityId === 'string' && record.identityId.trim().length > 0
                    ? { identityId: record.identityId }
                    : {}),
                ...(typeof record.projectSlug === 'string' && record.projectSlug.trim().length > 0
                    ? { projectSlug: record.projectSlug }
                    : {}),
            };
    }
}
function parseProfiles(value) {
    const record = assertRecord(value, 'profiles must be an object.');
    const parsed = {};
    for (const [profileId, profileValue] of Object.entries(record)) {
        const profile = assertRecord(profileValue, `Profile "${profileId}" must be an object.`);
        parsed[profileId] = {
            provider: assertNonEmptyString(profile.provider, `Profile "${profileId}" requires a non-empty provider reference.`),
            environment: assertNonEmptyString(profile.environment, `Profile "${profileId}" requires a non-empty environment.`),
        };
    }
    return parsed;
}
function parseSinks(value) {
    const record = assertRecord(value, 'sinks must be an object.');
    const parsed = {};
    for (const [sinkId, sinkValue] of Object.entries(record)) {
        if (!SECRET_SINK_NAMES.includes(sinkId)) {
            throw new Error(`Unsupported secret sink "${sinkId}".`);
        }
        const sink = assertRecord(sinkValue, `Sink "${sinkId}" must be an object.`);
        const allowedOps = sink.allowedOps;
        if (!Array.isArray(allowedOps) || allowedOps.length === 0) {
            throw new Error(`Sink "${sinkId}" requires a non-empty allowedOps array.`);
        }
        parsed[sinkId] = {
            defaultProfile: assertNonEmptyString(sink.defaultProfile, `Sink "${sinkId}" requires a non-empty defaultProfile.`),
            allowedOps: allowedOps.map((operation) => {
                if (typeof operation !== 'string' ||
                    !SECRET_SINK_OPERATIONS.includes(operation)) {
                    throw new Error(`Sink "${sinkId}" contains unsupported operation "${String(operation)}".`);
                }
                return operation;
            }),
        };
    }
    return parsed;
}
export function parseSecretsSchema(input) {
    const root = assertRecord(input, 'Secret orchestration config must be an object.');
    if (root.schemaVersion !== 1) {
        throw new Error(`Unsupported schemaVersion "${String(root.schemaVersion)}".`);
    }
    const providersRecord = assertRecord(root.providers, 'providers must be an object.');
    const providers = Object.fromEntries(Object.entries(providersRecord).map(([providerId, providerValue]) => [
        providerId,
        parseProviderConfig(providerId, providerValue),
    ]));
    const profiles = parseProfiles(root.profiles);
    const sinks = parseSinks(root.sinks);
    for (const [profileId, profile] of Object.entries(profiles)) {
        if (!(profile.provider in providers)) {
            throw new Error(`Profile "${profileId}" references unknown provider "${profile.provider}".`);
        }
    }
    for (const [sinkId, sink] of Object.entries(sinks)) {
        if (!(sink.defaultProfile in profiles)) {
            throw new Error(`Sink "${sinkId}" references unknown default profile "${sink.defaultProfile}".`);
        }
    }
    return {
        schemaVersion: 1,
        providers,
        profiles,
        sinks,
    };
}
export const SecretOrchestrationConfigSchema = {
    parse: parseSecretsSchema,
    safeParse(input) {
        try {
            return { success: true, data: parseSecretsSchema(input) };
        }
        catch (error) {
            return { success: false, error: error instanceof Error ? error : new Error(String(error)) };
        }
    },
};
export function parseSecretOrchestrationConfig(value) {
    return parseSecretsSchema(value);
}
export function getDefaultSecretProvider(config) {
    return config.providers.default;
}
export function isSecretOrchestrationConfig(value) {
    return SecretOrchestrationConfigSchema.safeParse(value).success;
}
export function asSecretSinkDefinitionMap(config) {
    return config.sinks;
}
function redactString(value, secrets) {
    let next = value;
    for (const secret of [...secrets].sort((left, right) => right.length - left.length)) {
        if (!secret)
            continue;
        next = next.split(secret).join('[REDACTED]');
    }
    return next;
}
export function redactSecretsValue(value, secrets) {
    if (typeof value === 'string') {
        return redactString(value, secrets);
    }
    if (Array.isArray(value)) {
        return value.map((entry) => redactSecretsValue(entry, secrets));
    }
    if (!value || typeof value !== 'object') {
        return value;
    }
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, redactSecretsValue(entry, secrets)]));
}
//# sourceMappingURL=schema.js.map