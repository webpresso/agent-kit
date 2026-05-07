/**
 * Resolves the blueprints directory for a consumer repo.
 *
 * Checks in priority order:
 *   1. `<projectPath>/blueprints/`           — generic consumer layout
 *   2. `<projectPath>/webpresso/blueprints/` — webpresso legacy fallback
 *
 * Fresh generic repos default to `<projectPath>/blueprints/` when a normal
 * project marker is present. Historical empty fixtures and Webpresso roots keep
 * the legacy fallback so older callers that mkdir after service construction
 * still work.
 */
import { existsSync } from 'node:fs';
import path from 'node:path';
const WEBPRESSO_CONFIG_PATH = 'webpresso/config.yaml';
const WEBPRESSO_BLUEPRINTS_DIR = 'webpresso/blueprints';
const DEFAULT_BLUEPRINTS_DIR = 'blueprints';
const GENERIC_PROJECT_MARKERS = [
    '.agent-kitrc.json',
    'pnpm-workspace.yaml',
    'package.json',
];
function hasWebpressoProjectMarker(projectPath) {
    return existsSync(path.join(projectPath, WEBPRESSO_CONFIG_PATH));
}
function hasGenericProjectMarker(projectPath) {
    return GENERIC_PROJECT_MARKERS.some((marker) => existsSync(path.join(projectPath, marker)));
}
export function resolveConsumerRoot({ defaultDir, webpressoDir, projectPath, }) {
    if (projectPath === undefined) {
        if (hasWebpressoProjectMarker(process.cwd()) && existsSync(path.resolve(webpressoDir))) {
            return webpressoDir;
        }
        if (existsSync(path.resolve(defaultDir)))
            return defaultDir;
        if (existsSync(path.resolve(webpressoDir)))
            return webpressoDir;
        return webpressoDir;
    }
    const webpressoPath = path.join(projectPath, webpressoDir);
    if (hasWebpressoProjectMarker(projectPath) && existsSync(webpressoPath)) {
        return webpressoPath;
    }
    const genericPath = path.join(projectPath, defaultDir);
    if (existsSync(genericPath))
        return genericPath;
    if (existsSync(webpressoPath))
        return webpressoPath;
    if (hasGenericProjectMarker(projectPath) && !hasWebpressoProjectMarker(projectPath)) {
        return genericPath;
    }
    return webpressoPath;
}
export function resolveBlueprintRoot(projectPath) {
    return resolveConsumerRoot({
        defaultDir: DEFAULT_BLUEPRINTS_DIR,
        webpressoDir: WEBPRESSO_BLUEPRINTS_DIR,
        projectPath,
    });
}
//# sourceMappingURL=blueprint-root.js.map