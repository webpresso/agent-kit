import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
export function repoHashFromRoot(root) {
    return createHash('sha256').update(root).digest('hex').slice(0, 16);
}
export function computeRepoHash(startDir = process.cwd()) {
    let root;
    try {
        root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
            cwd: startDir,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'ignore'],
        }).trim();
    }
    catch {
        root = startDir;
    }
    return repoHashFromRoot(root);
}
//# sourceMappingURL=repo-hash.js.map