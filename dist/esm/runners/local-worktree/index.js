import { spawnSync as nodeSpawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { generateWorktreePath } from './path.js';
// ---------------------------------------------------------------------------
// LocalWorktreeExecution
// ---------------------------------------------------------------------------
class LocalWorktreeExecution {
    handle;
    worktreePath;
    spawnSync;
    cwd;
    events = [];
    worktreeCreated = false;
    tornDown = false;
    constructor(handle, worktreePath, cwd, spawnFn) {
        this.handle = handle;
        this.worktreePath = worktreePath;
        this.cwd = cwd;
        this.spawnSync = spawnFn;
    }
    async *run(_signal) {
        const ts = new Date().toISOString();
        const started = { type: 'started', ts, handle: this.handle };
        this.events.push(started);
        yield started;
        const result = this.spawnSync('git', ['worktree', 'add', this.worktreePath], { cwd: this.cwd });
        if (result.status !== 0) {
            const stderr = result.stderr instanceof Buffer ? result.stderr.toString() : String(result.stderr);
            const failed = {
                type: 'failed',
                ts: new Date().toISOString(),
                handle: this.handle,
                error: stderr || 'git worktree add failed',
            };
            this.events.push(failed);
            yield failed;
            return;
        }
        this.worktreeCreated = true;
        const completed = {
            type: 'completed',
            ts: new Date().toISOString(),
            handle: this.handle,
            exitCode: 0,
        };
        this.events.push(completed);
        yield completed;
    }
    snapshot() {
        const last = this.events[this.events.length - 1];
        const status = last?.type === 'completed'
            ? 'completed'
            : last?.type === 'failed'
                ? 'failed'
                : last?.type === 'cancelled'
                    ? 'cancelled'
                    : 'running';
        return { handle: this.handle, status, events: [...this.events] };
    }
    async teardown() {
        if (this.tornDown || !this.worktreeCreated) {
            return;
        }
        this.tornDown = true;
        this.spawnSync('git', ['worktree', 'remove', '--force', this.worktreePath], { cwd: this.cwd });
    }
}
// ---------------------------------------------------------------------------
// LocalWorktreeRunner
// ---------------------------------------------------------------------------
export class LocalWorktreeRunner {
    id = 'local-worktree';
    version = '0.1.0';
    capabilities = ['worktree'];
    spawnSync;
    constructor(opts = {}) {
        this.spawnSync = opts.spawnSync ?? nodeSpawnSync;
    }
    prepare(task, ctx) {
        const handle = randomUUID();
        const worktreePath = generateWorktreePath(ctx.cwd, task.id);
        return new LocalWorktreeExecution(handle, worktreePath, ctx.cwd, this.spawnSync);
    }
}
//# sourceMappingURL=index.js.map