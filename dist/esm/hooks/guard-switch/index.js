#!/usr/bin/env node
import { runHook } from '#hooks/shared/hook-bootstrap';
import { setGuardEnabled } from './state.js';
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
//# sourceMappingURL=index.js.map