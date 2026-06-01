#!/usr/bin/env bun
import { runHook } from '#hooks/shared/hook-bootstrap';
import { realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { setGuardEnabled } from './state.js';
export async function main() {
    runHook((input) => {
        const normalized = (input.prompt ?? '').toLowerCase().trim();
        if (normalized === 'guard off') {
            setGuardEnabled(false);
            console.error('🛡️ Guard disabled — pretool validators will be skipped');
            process.exit(2);
        }
        if (normalized === 'guard on') {
            setGuardEnabled(true);
            console.error('🛡️ Guard enabled — pretool validators active');
            process.exit(2);
        }
        return null;
    }, () => '{}');
}
if (process.argv[1] &&
    realpathSync(fileURLToPath(import.meta.url)) === realpathSync(process.argv[1])) {
    void main();
}
//# sourceMappingURL=index.js.map