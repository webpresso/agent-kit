import { readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
export function sentinelPath() {
    return join(tmpdir(), `ak-mcp-ready-${process.ppid}`);
}
export function isMcpReady() {
    if (process.platform === 'win32')
        return false;
    try {
        const pid = parseInt(readFileSync(sentinelPath(), 'utf-8'), 10);
        process.kill(pid, 0);
        return true;
    }
    catch (err) {
        if (err.code === 'ESRCH')
            return false;
        return false;
    }
}
export function writeSentinel() {
    writeFileSync(sentinelPath(), String(process.pid), 'utf-8');
}
export function deleteSentinel() {
    try {
        unlinkSync(sentinelPath());
    }
    catch {
        // ignore — sentinel may not exist
    }
}
//# sourceMappingURL=mcp-sentinel.js.map