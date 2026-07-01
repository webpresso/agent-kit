import { spawnSync } from "node:child_process";
// ---------------------------------------------------------------------------
// CodexExecExecution
// ---------------------------------------------------------------------------
class CodexExecExecution {
    handle;
    _task;
    _ctx;
    _spawn;
    _status = "running";
    _events = [];
    constructor(handle, task, ctx, spawnFn) {
        this.handle = handle;
        this._task = task;
        this._ctx = ctx;
        this._spawn = spawnFn;
    }
    async *run(signal) {
        const ts = () => new Date().toISOString();
        const startedEvent = { type: "started", ts: ts(), handle: this.handle };
        this._events.push(startedEvent);
        yield startedEvent;
        if (signal?.aborted === true) {
            const cancelledEvent = { type: "cancelled", ts: ts(), handle: this.handle };
            this._events.push(cancelledEvent);
            this._status = "cancelled";
            yield cancelledEvent;
            return;
        }
        const result = this._spawn("codex", ["exec", this._task.description, "-s", "read-only", "-C", this._ctx.cwd], {
            encoding: "buffer",
        });
        const stdoutStr = result.stdout.toString("utf8");
        for (const line of splitLines(stdoutStr)) {
            const evt = { type: "stdout", ts: ts(), handle: this.handle, line };
            this._events.push(evt);
            yield evt;
        }
        const stderrStr = result.stderr.toString("utf8");
        for (const line of splitLines(stderrStr)) {
            const evt = { type: "stderr", ts: ts(), handle: this.handle, line };
            this._events.push(evt);
            yield evt;
        }
        if (result.status === 0) {
            const completedEvent = {
                type: "completed",
                ts: ts(),
                handle: this.handle,
                exitCode: 0,
            };
            this._events.push(completedEvent);
            this._status = "completed";
            yield completedEvent;
        }
        else {
            const exitCode = result.status ?? 1;
            const failedEvent = {
                type: "failed",
                ts: ts(),
                handle: this.handle,
                error: `codex exited with code ${exitCode}`,
            };
            this._events.push(failedEvent);
            this._status = "failed";
            yield failedEvent;
        }
    }
    snapshot() {
        return {
            handle: this.handle,
            status: this._status,
            events: [...this._events],
        };
    }
    async teardown() {
        // Idempotent no-op in v1.0 (spawnSync is synchronous; no process to kill)
    }
}
// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function splitLines(text) {
    return text.split("\n").filter((line) => line.length > 0);
}
// ---------------------------------------------------------------------------
// CodexExecRunner
// ---------------------------------------------------------------------------
export class CodexExecRunner {
    id = "codex-exec";
    version = "1.0.0";
    capabilities = ["read-only"];
    _spawn;
    constructor(options = {}) {
        this._spawn = options.spawn ?? spawnSync;
    }
    prepare(task, ctx) {
        if (task.permissions === "workspace-write") {
            throw new Error("codex-exec backend only supports read-only tasks in v1.0 alpha. See tech-debt item h-002 for workspace-write support.");
        }
        const handle = crypto.randomUUID();
        return new CodexExecExecution(handle, task, ctx, this._spawn);
    }
}
//# sourceMappingURL=index.js.map