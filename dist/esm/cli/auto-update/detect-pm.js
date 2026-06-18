/**
 * Install-topology detection for the auto-update installer.
 *
 * Agent Kit is distributed as a published package installed by Vite+ (`vp`).
 * Auto-update intentionally has one supported consumer lane: refresh the global
 * Vite+ install with `vp install -g @webpresso/agent-kit`. Local dev/source
 * execution is explicit via `WP_FORCE_SOURCE=1` and is not an install topology.
 */
import { realpathSync } from 'node:fs';
import { delimiter, sep } from 'node:path';
import { getLegacyAgentCommandReplacement } from '#cli/bundle/agent-command-inventory.js';
export const PUBLIC_PACKAGE_NAME = '@webpresso/agent-kit';
export const PUBLIC_NPM_REGISTRY = 'https://registry.npmjs.org';
/**
 * Canonical global-install command for the public agent-kit.
 *
 * Vite+ is the supported package-manager surface for global Agent Kit
 * consumers. Do not reintroduce npm/pnpm/homebrew/local-bin variants here.
 */
export function buildVpGlobalInstallCommand() {
    return ['vp', 'install', '-g', PUBLIC_PACKAGE_NAME];
}
const VP_INSTALL_COMMAND = buildVpGlobalInstallCommand();
function commandForTopology(_topology) {
    return VP_INSTALL_COMMAND;
}
export function formatLegacyCommandReplacementMessage(legacyCommand) {
    const replacement = getLegacyAgentCommandReplacement(legacyCommand);
    if (replacement === null)
        return null;
    return `Legacy agent-kit command \`${legacyCommand}\` has a future replacement: \`${replacement}\`.`;
}
/**
 * Detect the install topology that owns the running `wp` / agent-kit binary.
 */
export function detect(env, argv0) {
    if (env.WP_FORCE_SOURCE === '1') {
        return {
            abort: 'WP_FORCE_SOURCE=1 is enabled; source-mode development is explicit and auto-install is disabled.',
        };
    }
    const realpath = safeRealpath(argv0);
    if (realpath === null) {
        return { abort: unableToDetectMessage(argv0) };
    }
    if (isProjectLocalNodeModulesBin(realpath) || isProjectLocalNodeModulesBin(argv0)) {
        return {
            abort: `${PUBLIC_PACKAGE_NAME} is running from a project-local node_modules tree (${realpath}); install the published package with \`vp install -g ${PUBLIC_PACKAGE_NAME}\` and run global \`wp\`.`,
        };
    }
    const fromPath = matchStoreMarker(realpath);
    const fromUa = parseUserAgent(env.npm_config_user_agent ?? '');
    if (fromPath === 'vp' || fromUa === 'vp') {
        return { topology: 'vp', command: commandForTopology('vp') };
    }
    const shim = detectShim(realpath);
    if (shim !== null)
        return { abort: shim };
    return { abort: unableToDetectMessage(realpath) };
}
/**
 * Parse the `npm_config_user_agent` string. Only Vite+ (`vp`) is accepted as a
 * supported global-install topology. Other package managers may execute project
 * installs, but they do not own Agent Kit's global consumer install.
 */
export function parseUserAgent(userAgent) {
    const trimmed = userAgent.trim();
    if (trimmed.length === 0)
        return null;
    const head = trimmed.split(/\s+/, 1)[0];
    if (head === undefined)
        return null;
    const slash = head.indexOf('/');
    const name = (slash === -1 ? head : head.slice(0, slash)).toLowerCase();
    return name === 'vp' ? 'vp' : null;
}
/**
 * Look for the only supported global install store marker.
 */
export function matchStoreMarker(realpath) {
    const segments = splitPathSegments(realpath);
    return segments.includes('.vite-plus') ? 'vp' : null;
}
/**
 * Detect unsupported shim/global-manager layouts and provide the supported fix.
 */
export function detectShim(realpath) {
    const segments = splitPathSegments(realpath);
    if (segments.includes('.volta'))
        return unsupportedManagerMessage('Volta', realpath);
    if (segments.includes('.asdf'))
        return unsupportedManagerMessage('asdf', realpath);
    if (segments.includes('Cellar') || segments.includes('Homebrew')) {
        return unsupportedManagerMessage('Homebrew', realpath);
    }
    if (segments.includes('.npm-global') || isGlobalNodeModules(realpath)) {
        return unsupportedManagerMessage('npm global', realpath);
    }
    if (segments.some((seg) => seg === '.pnpm' || seg === '.pnpm-store' || seg === 'pnpm-global')) {
        return unsupportedManagerMessage('pnpm global', realpath);
    }
    if (segments.includes('.bun') && (segments.includes('install') || segments.includes('global'))) {
        return unsupportedManagerMessage('bun global', realpath);
    }
    if (segments.includes('.yarn') && (segments.includes('global') || segments.includes('berry'))) {
        return unsupportedManagerMessage('yarn global', realpath);
    }
    return null;
}
/**
 * Vite+ global installs are the only accepted consumer global topology.
 * Exported for testability and for legacy callers that still ask the question.
 */
export function confirmInstalledGlobally(realpath, _env) {
    return matchStoreMarker(realpath) === 'vp';
}
function unsupportedManagerMessage(manager, realpath) {
    return `${PUBLIC_PACKAGE_NAME} appears to be managed by ${manager} (${realpath}); reinstall with \`vp install -g ${PUBLIC_PACKAGE_NAME}\`. Source development uses WP_FORCE_SOURCE=1 from an agent-kit checkout.`;
}
function unableToDetectMessage(pathHint) {
    return `Unable to verify a Vite+ global install for ${PUBLIC_PACKAGE_NAME} at ${pathHint}; auto-install disabled. Install with \`vp install -g ${PUBLIC_PACKAGE_NAME}\` or use WP_FORCE_SOURCE=1 inside the agent-kit source repo.`;
}
function isProjectLocalNodeModulesBin(p) {
    const segments = splitPathSegments(p);
    return (segments.includes('node_modules') && !segments.includes('.vite-plus') && !isGlobalNodeModules(p));
}
function isGlobalNodeModules(p) {
    return (p.includes(`${sep}usr${sep}local${sep}lib${sep}node_modules${sep}`) ||
        p.includes(`${sep}opt${sep}homebrew${sep}lib${sep}node_modules${sep}`) ||
        p.includes(`${sep}lib${sep}node_modules${sep}`));
}
function safeRealpath(p) {
    try {
        return realpathSync(p);
    }
    catch {
        return null;
    }
}
function splitPathSegments(p) {
    const normalized = p.replace(/\\/g, sep);
    const stripped = normalized.startsWith(sep) ? normalized.slice(sep.length) : normalized;
    return stripped.split(sep).filter((s) => s.length > 0 && s !== delimiter);
}
//# sourceMappingURL=detect-pm.js.map