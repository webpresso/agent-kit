import { existsSync, readdirSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, relative } from 'node:path';
import { SHARED_FAVORITE_SKILLS } from './scaffold-agent.js';
export const AGENT_HOSTS = ['codex', 'claude', 'opencode'];
export const REQUIRED_CORE_CAPABILITIES = SHARED_FAVORITE_SKILLS;
export const VISIBILITY_STATUSES = ['visible-now', 'visible-after-restart', 'not-visible'];
export const SETUP_SURFACE_HOSTS = ['claude', 'codex', 'cursor', 'opencode'];
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
/**
 * Installed-plugin skill cache roots for a plugin host. Skills are delivered to
 * Claude/Codex by their plugins, which unpack to versioned cache dirs:
 *   `~/.claude/plugins/cache/<marketplace>/agent-kit/<version>/skills`
 *   `~/.codex/plugins/cache/<marketplace>/agent-kit/<version>/skills`
 * We scan every marketplace/version so a capability counts as visible when the
 * plugin is installed, independent of the (no-longer-projected) skill dirs.
 */
function pluginCacheSkillRoots(homeDir, vendor) {
    const base = vendor === 'claude'
        ? join(homeDir, '.claude', 'plugins', 'cache')
        : join(homeDir, '.codex', 'plugins', 'cache');
    const roots = [];
    try {
        for (const marketplace of readdirSync(base)) {
            const pluginDir = join(base, marketplace, 'agent-kit');
            let versions;
            try {
                versions = readdirSync(pluginDir);
            }
            catch {
                continue;
            }
            for (const version of versions) {
                const skills = join(pluginDir, version, 'skills');
                if (existsSync(skills))
                    roots.push(skills);
            }
        }
    }
    catch {
        // Cache dir absent — plugin not installed on this machine.
    }
    return roots;
}
export function hostSkillRoots(repoRoot, host, homeDir = homedir()) {
    // The canonical `.agent/skills/` SSOT is always projected by `wp setup`, so a
    // required capability present there is installed in the repo and reaches a
    // plugin host through its plugin. Plugin install success/failure is reported
    // separately by the plugin scaffolder; visibility here confirms the skill is
    // installed (plugin cache) or at least present in the repo agent surface.
    const canonical = join(repoRoot, '.agent', 'skills');
    switch (host) {
        case 'codex':
            return {
                // `.agents/skills` only exists when the Codex plugin is opted out.
                project: [canonical, join(repoRoot, '.agents', 'skills')],
                user: [...pluginCacheSkillRoots(homeDir, 'codex'), join(homeDir, '.agents', 'skills')],
                global: ['/etc/codex/skills'],
            };
        case 'claude':
            return {
                // `.claude/skills` only exists when the Claude plugin is opted out.
                project: [canonical, join(repoRoot, '.claude', 'skills')],
                user: [...pluginCacheSkillRoots(homeDir, 'claude'), join(homeDir, '.claude', 'skills')],
                global: [],
            };
        case 'opencode':
            return {
                project: [
                    join(repoRoot, '.opencode', 'skills'),
                    canonical,
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
function allExist(repoRoot, relativePaths) {
    return relativePaths.every((relativePath) => existsSync(join(repoRoot, relativePath)));
}
export function auditHostSetupSurfaceVisibility(input) {
    const { repoRoot, packageRoot } = input;
    const opencodeBridgeInstalled = existsSync(join(repoRoot, '.opencode', 'plugins', 'webpresso-hooks.js'));
    return [
        {
            host: 'claude',
            artifact: existsSync(join(packageRoot, '.claude-plugin', 'plugin.json'))
                ? 'installed'
                : 'missing',
            active: existsSync(join(repoRoot, '.claude', 'settings.json')) ? 'managed' : 'not-installed',
            support: 'full',
            required: true,
            ownership: 'plugin artifact owns MCP; active hooks setup-managed in .claude/settings.json',
        },
        {
            host: 'codex',
            artifact: allExist(packageRoot, [
                '.codex-plugin/plugin.json',
                'codex.mcp.json',
                'hooks/hooks.json',
            ])
                ? 'installed'
                : 'missing',
            active: existsSync(join(repoRoot, '.codex', 'hooks.json')) ? 'managed' : 'not-installed',
            support: 'full',
            required: true,
            ownership: 'hooks/hooks.json metadata; active hooks setup-managed in .codex/hooks.json',
        },
        {
            host: 'cursor',
            artifact: 'deferred',
            active: existsSync(join(repoRoot, '.cursor', 'hooks.json')) ? 'managed' : 'not-installed',
            support: 'degraded',
            required: false,
            ownership: 'project hook config only; no packaged plugin artifact is shipped',
        },
        {
            host: 'opencode',
            artifact: opencodeBridgeInstalled ? 'installed' : 'deferred',
            active: opencodeBridgeInstalled ? 'plugin-bridge' : 'not-installed',
            support: 'degraded',
            required: false,
            ownership: 'generated whole-file plugin bridge under .opencode/plugins/webpresso-hooks.js',
        },
    ];
}
export function summarizeHostSetupSurfaceVisibility(input) {
    return auditHostSetupSurfaceVisibility(input).map((surface) => `  ${surface.host}: artifact=${surface.artifact} active=${surface.active} ` +
        `support=${surface.support} required=${surface.required ? 'yes' : 'no'} ` +
        `(${surface.ownership})`);
}
//# sourceMappingURL=host-visibility.js.map