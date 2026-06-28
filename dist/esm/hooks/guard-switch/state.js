import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { getSurfacePath, NotInGitRepoError } from "#paths/state-root.js";
import { readTrustedJsonFile } from "#shared-utils/read-json-file.js";
import { writeJsonFile } from "#shared-utils/write-json-file.js";
export function getStateFilePath() {
    try {
        return getSurfacePath("worktree/guard-state.json", "worktree");
    }
    catch (err) {
        if (err instanceof NotInGitRepoError)
            return "/tmp/webpresso-guard-state.json";
        throw err;
    }
}
export function isGuardEnabled() {
    try {
        const stateFile = getStateFilePath();
        const data = readTrustedJsonFile(stateFile);
        return data.guardEnabled !== false;
    }
    catch {
        return true;
    }
}
export function setGuardEnabled(enabled) {
    const stateFile = getStateFilePath();
    mkdirSync(dirname(stateFile), { recursive: true });
    writeJsonFile(stateFile, { guardEnabled: enabled }, { atomic: true, indent: 0, trailingNewline: false });
}
//# sourceMappingURL=state.js.map