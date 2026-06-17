import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
const COMMITTED_RELATIVE_PATH = path.join('.webpresso', 'secrets.config.json');
const RUNTIME_RELATIVE_PATH = path.join('webpresso', 'secrets.json');
function resolveGitCommonDir(cwd) {
    try {
        const out = execFileSync('git', ['rev-parse', '--git-common-dir'], {
            cwd,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
        if (!out)
            return null;
        return path.isAbsolute(out) ? out : path.resolve(cwd, out);
    }
    catch {
        return null;
    }
}
export function getRuntimeSecretsConfigPath(cwd = process.cwd()) {
    const gitDir = resolveGitCommonDir(cwd);
    return gitDir ? path.join(gitDir, RUNTIME_RELATIVE_PATH) : null;
}
export function getCommittedSecretsConfigPath(cwd = process.cwd()) {
    return path.join(cwd, COMMITTED_RELATIVE_PATH);
}
export function getPreferredSecretsConfigPath(cwd = process.cwd()) {
    return getRuntimeSecretsConfigPath(cwd) ?? getCommittedSecretsConfigPath(cwd);
}
function isManager(value) {
    return value === 'doppler' || value === 'infisical';
}
function parseConfig(raw, source) {
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        throw new Error(`Malformed secrets config at ${source}: ${detail}`);
    }
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        throw new Error(`Malformed secrets config at ${source}: expected object`);
    }
    const obj = parsed;
    if (!isManager(obj.manager)) {
        throw new Error(`Malformed secrets config at ${source}: "manager" must be "doppler" or "infisical"`);
    }
    if (typeof obj.projectId !== 'string' || obj.projectId.length === 0) {
        throw new Error(`Malformed secrets config at ${source}: "projectId" must be a non-empty string`);
    }
    return {
        manager: obj.manager,
        projectId: obj.projectId,
        ...(typeof obj.projectLabel === 'string' && obj.projectLabel.length > 0
            ? { projectLabel: obj.projectLabel }
            : {}),
    };
}
export function readSecretsConfig(cwd = process.cwd()) {
    const runtimePath = getRuntimeSecretsConfigPath(cwd);
    if (runtimePath && existsSync(runtimePath)) {
        return parseConfig(readFileSync(runtimePath, 'utf8'), runtimePath);
    }
    const committedPath = getCommittedSecretsConfigPath(cwd);
    if (existsSync(committedPath)) {
        return parseConfig(readFileSync(committedPath, 'utf8'), committedPath);
    }
    return null;
}
//# sourceMappingURL=secrets-config.js.map