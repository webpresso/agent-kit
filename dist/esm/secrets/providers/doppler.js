import { BUILTIN_SECRET_SINKS } from '#secrets/sinks/types.js';
export function createDopplerRedactionPolicy(input) {
    return { values: [...new Set(input.values.filter(Boolean))] };
}
export function diagnoseDopplerProvider(input) {
    const workspace = input.provider.workspace ?? 'unknown-workspace';
    return {
        ok: true,
        code: 'WP_SECRETS_PROVIDER_READY',
        problem: `doppler profile "${input.profileName}" is configured.`,
        fix: `If auth drifts, run: doppler login --scope ${workspace}`,
        evidence: `provider=doppler workspace=${workspace} environment=${input.environment}`,
    };
}
export function fetchDopplerProfile(input) {
    const project = input.provider.project ?? input.provider.projectId ?? input.provider.projectSlug;
    return {
        environment: {},
        redactedValues: [project, input.environment].filter((value) => Boolean(value)),
    };
}
export function planDopplerBootstrap(input) {
    const requiredSecrets = [
        ...new Set(input.lanes.map((lane) => lane === 'prd' ? 'CI_SECRET_PROVIDER_TOKEN_PRODUCTION' : 'CI_SECRET_PROVIDER_TOKEN_PREVIEW')),
    ];
    return {
        mode: 'service-token',
        lanes: input.lanes,
        requiredSecrets,
    };
}
export const dopplerProviderPlugin = {
    id: 'doppler',
    authModes: {
        local: 'cli-login',
        ci: ['oidc', 'service-token'],
    },
    capabilities: {
        profiles: ['preview', 'production'],
        sinks: BUILTIN_SECRET_SINKS,
        bootstrap: ['github-actions-bootstrap', 'manual'],
    },
    redactionPolicy: createDopplerRedactionPolicy,
    diagnose: diagnoseDopplerProvider,
    fetchProfile: fetchDopplerProfile,
    planBootstrap: planDopplerBootstrap,
};
//# sourceMappingURL=doppler.js.map