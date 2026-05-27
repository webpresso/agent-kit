import { mkdirSync } from 'node:fs';
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { getSurfacePath, NotInGitRepoError } from '#paths/state-root.js';
export function getStateFilePath() {
    try {
        return getSurfacePath('worktree/guard-state.json', 'worktree');
    }
    catch (err) {
        if (err instanceof NotInGitRepoError)
            return '/tmp/webpresso-guard-state.json';
        throw err;
    }
}
export function isGuardEnabled() {
    try {
        const stateFile = getStateFilePath();
        const data = JSON.parse(readFileSync(stateFile, 'utf-8'));
        return data.guardEnabled !== false;
    }
    catch {
        return true;
    }
}
export function setGuardEnabled(enabled) {
    const stateFile = getStateFilePath();
    mkdirSync(dirname(stateFile), { recursive: true });
    writeFileSync(stateFile, JSON.stringify({ guardEnabled: enabled }));
}
//# sourceMappingURL=state.js.map