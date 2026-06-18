// ---------------------------------------------------------------------------
// Stub default subagent — replaced in Wave 4 (Task 4.1)
// ---------------------------------------------------------------------------
const notImplemented = (_prompt, _opts) => {
    return Promise.reject(new Error('not implemented — inject subagentFn'));
};
// ---------------------------------------------------------------------------
// ClaudeSubagentExecution — live execution handle
// ---------------------------------------------------------------------------
class ClaudeSubagentExecution {
    handle;
    task;
    ctx;
    subagentFn;
    collectedEvents = [];
    status = 'running';
    constructor(handle, task, ctx, subagentFn) {
        this.handle = handle;
        this.task = task;
        this.ctx = ctx;
        this.subagentFn = subagentFn;
    }
    async *run(signal) {
        if (signal?.aborted === true) {
            const event = {
                type: 'cancelled',
                ts: new Date().toISOString(),
                handle: this.handle,
            };
            this.collectedEvents.push(event);
            this.status = 'cancelled';
            yield event;
            return;
        }
        const startedEvent = {
            type: 'started',
            ts: new Date().toISOString(),
            handle: this.handle,
        };
        this.collectedEvents.push(startedEvent);
        yield startedEvent;
        try {
            const output = await this.subagentFn(this.task.description, {
                cwd: this.ctx.cwd,
                env: this.ctx.env,
                signal,
            });
            for (const line of output.split('\n')) {
                if (line.length === 0) {
                    continue;
                }
                const stdoutEvent = {
                    type: 'stdout',
                    ts: new Date().toISOString(),
                    handle: this.handle,
                    line,
                };
                this.collectedEvents.push(stdoutEvent);
                yield stdoutEvent;
            }
            const completedEvent = {
                type: 'completed',
                ts: new Date().toISOString(),
                handle: this.handle,
                exitCode: 0,
            };
            this.collectedEvents.push(completedEvent);
            this.status = 'completed';
            yield completedEvent;
        }
        catch (err) {
            const message = err instanceof Error ? err.message : String(err);
            const failedEvent = {
                type: 'failed',
                ts: new Date().toISOString(),
                handle: this.handle,
                error: message,
            };
            this.collectedEvents.push(failedEvent);
            this.status = 'failed';
            yield failedEvent;
        }
    }
    snapshot() {
        return {
            handle: this.handle,
            status: this.status,
            events: [...this.collectedEvents],
        };
    }
    async teardown() {
        // Idempotent — nothing to clean up for the subagent-based runner.
        // Called once or multiple times; both are safe.
    }
}
// ---------------------------------------------------------------------------
// ClaudeSubagentRunner — factory
// ---------------------------------------------------------------------------
export class ClaudeSubagentRunner {
    id = 'claude-subagent';
    version;
    capabilities;
    subagentFn;
    constructor(version, subagentFn = notImplemented) {
        this.version = version;
        this.capabilities = ['read', 'workspace-write'];
        this.subagentFn = subagentFn;
    }
    prepare(task, ctx) {
        const handle = crypto.randomUUID();
        return new ClaudeSubagentExecution(handle, task, ctx, this.subagentFn);
    }
}
//# sourceMappingURL=index.js.map