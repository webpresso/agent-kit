import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';
const CI_ACT_SECRET_PROFILES = {
    none: {
        id: 'none',
        description: 'No secrets are injected.',
        allowedKeys: [],
        requiredKeys: [],
        defaultSources: [],
    },
    'github-api': {
        id: 'github-api',
        description: 'GitHub API token surface.',
        allowedKeys: ['GITHUB_TOKEN', 'GITHUB_PAT'],
        requiredKeys: [],
        defaultSources: [],
    },
    'neon-control-plane': {
        id: 'neon-control-plane',
        description: 'Neon control-plane secrets.',
        allowedKeys: ['NEON_API_KEY', 'NEON_PROJECT_ID', 'NEON_PARENT_BRANCH_ID'],
        requiredKeys: ['NEON_API_KEY', 'NEON_PROJECT_ID', 'NEON_PARENT_BRANCH_ID'],
        defaultSources: [],
    },
};
const WORKFLOW_PROFILES = {
    'ci.yml': 'none',
    'testing-e2e.yml': 'none',
    'testing-e2e-act.yml': 'none',
    'cleanup-stale-neon-e2e-branches.yml': 'neon-control-plane',
};
export function isCiActSecretProfileId(value) {
    return value in CI_ACT_SECRET_PROFILES;
}
export function getCiActSecretProfile(profileId) {
    return CI_ACT_SECRET_PROFILES[profileId];
}
function resolveJobSecretProfile(jobName) {
    if (!jobName)
        return undefined;
    if (jobName === 'cleanup')
        return 'neon-control-plane';
    return undefined;
}
export function resolveCiActSecretProfile(options) {
    if (options.explicitProfileId && isCiActSecretProfileId(options.explicitProfileId)) {
        return getCiActSecretProfile(options.explicitProfileId);
    }
    const workflowName = options.workflowPath ? basename(options.workflowPath) : undefined;
    const workflowProfile = workflowName ? WORKFLOW_PROFILES[workflowName] : undefined;
    const jobProfile = resolveJobSecretProfile(options.jobName);
    return getCiActSecretProfile(jobProfile ?? workflowProfile ?? 'none');
}
export function pickAllowedSecrets(secretMap, allowedKeys) {
    if (allowedKeys.length === 0)
        return {};
    return Object.fromEntries(allowedKeys.flatMap((key) => {
        const value = secretMap[key];
        return typeof value === 'string' && value.length > 0 ? [[key, value]] : [];
    }));
}
export function listMissingRequiredSecrets(secretMap, requiredKeys) {
    return requiredKeys.filter((key) => {
        const value = secretMap[key];
        return typeof value !== 'string' || value.length === 0;
    });
}
export function normalizeActSecretsWithOptions(secretMaps, options) {
    const merged = {};
    for (const map of secretMaps) {
        for (const [key, value] of Object.entries(map)) {
            if (value.length > 0)
                merged[key] = value;
        }
    }
    if (options.mapGithubPatToToken && !merged.GITHUB_TOKEN && merged.GITHUB_PAT) {
        merged.GITHUB_TOKEN = merged.GITHUB_PAT;
    }
    return merged;
}
export function renderSecretsFile(secretMap) {
    return Object.entries(secretMap)
        .toSorted(([a], [b]) => a.localeCompare(b))
        .map(([key, value]) => `${key}=${JSON.stringify(value)}`)
        .join('\n');
}
export function injectDefaultActArgs(args, platform = process.platform, arch = process.arch) {
    const hasArchitectureFlag = args.includes('--container-architecture');
    if (platform === 'darwin' && arch === 'arm64' && !hasArchitectureFlag) {
        return ['--container-architecture', 'linux/amd64', ...args];
    }
    return args;
}
export function writeTempSecretsFile(secretMap) {
    const dir = mkdtempSync(join(tmpdir(), 'wp-ci-act-'));
    const path = join(dir, 'secrets.env');
    writeFileSync(path, `${renderSecretsFile(secretMap)}\n`, { encoding: 'utf8', mode: 0o600 });
    return {
        path,
        cleanup() {
            rmSync(dir, { recursive: true, force: true });
        },
    };
}
//# sourceMappingURL=act-helper.js.map