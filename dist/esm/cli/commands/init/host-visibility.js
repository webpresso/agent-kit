import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative } from 'node:path';
export const AGENT_HOSTS = ['codex', 'claude', 'opencode'];
export const REQUIRED_CORE_CAPABILITIES = ['verify', 'plan-refine'];
export const VISIBILITY_STATUSES = ['visible-now', 'visible-after-restart', 'not-visible'];
export function parseAgentHosts(value) {
    if (value?.trim() === 'none')
        return [];
    if (!value || value.trim().length === 0 || value.trim() === 'all')
        return [...AGENT_HOSTS];
    const out = [];
    const unknown = [];
    for (const raw of value.split(',')) {
        const token = raw.trim();
        if (!token)
            continue;
        if (AGENT_HOSTS.includes(token))
            out.push(token);
        else
            unknown.push(token);
    }
    if (unknown.length > 0) {
        throw new Error(`Unknown host(s): ${unknown.join(', ')}. Expected one of: ${AGENT_HOSTS.join(', ')}, all, none.`);
    }
    return [...new Set(out)];
}
export function hostSkillRoots(repoRoot, host, homeDir = homedir()) {
    switch (host) {
        case 'codex':
            return {
                project: [join(repoRoot, '.agents', 'skills')],
                user: [join(homeDir, '.agents', 'skills')],
                global: ['/etc/codex/skills'],
            };
        case 'claude':
            return {
                project: [join(repoRoot, '.claude', 'skills')],
                user: [join(homeDir, '.claude', 'skills')],
                global: [],
            };
        case 'opencode':
            return {
                project: [
                    join(repoRoot, '.opencode', 'skills'),
                    join(repoRoot, '.claude', 'skills'),
                    join(repoRoot, '.agents', 'skills'),
                ],
                user: [
                    join(homeDir, '.config', 'opencode', 'skills'),
                    join(homeDir, '.claude', 'skills'),
                    join(homeDir, '.agents', 'skills'),
                ],
                global: [],
            };
    }
}
export function auditHostSkillVisibility(input) {
    const selectedHosts = input.hosts ? [...input.hosts] : [...AGENT_HOSTS];
    const requiredCapabilities = input.requiredCapabilities && input.requiredCapabilities.length > 0
        ? [...input.requiredCapabilities]
        : [...REQUIRED_CORE_CAPABILITIES];
    const results = [];
    for (const host of selectedHosts) {
        const roots = hostSkillRoots(input.repoRoot, host, input.homeDir);
        const checkedRoots = [...roots.project, ...roots.user, ...roots.global];
        for (const capability of requiredCapabilities) {
            const foundPaths = checkedRoots
                .map((root) => join(root, capability, 'SKILL.md'))
                .filter((path) => existsSync(path));
            const status = foundPaths.length === 0
                ? 'not-visible'
                : input.liveSkillSlugs?.has(capability) === true
                    ? 'visible-now'
                    : 'visible-after-restart';
            results.push({
                host,
                capability,
                status,
                checkedRoots,
                foundPaths,
                restartRequired: status === 'visible-after-restart',
            });
        }
    }
    return { selectedHosts, requiredCapabilities, results };
}
export function serializeHostVisibility(audit) {
    const byHost = {};
    for (const result of audit.results) {
        byHost[result.host] ??= {};
        byHost[result.host][result.capability] = result.status;
    }
    return byHost;
}
export function summarizeHostVisibility(repoRoot, audit) {
    return audit.results.map((result) => {
        const detail = result.foundPaths.length > 0
            ? result.foundPaths.map((path) => relative(repoRoot, path).replaceAll('\\', '/')).join(', ')
            : result.checkedRoots
                .map((path) => relative(repoRoot, path).replaceAll('\\', '/'))
                .join(', ');
        const marker = result.status === 'not-visible' ? '✗' : result.status === 'visible-now' ? '✓' : '↻';
        return `  ${result.host}: ${marker} ${result.capability} ${result.status} (${detail})`;
    });
}
//# sourceMappingURL=host-visibility.js.map