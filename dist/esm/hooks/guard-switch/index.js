#!/usr/bin/env node
import { setGuardEnabled } from './state.js';
async function readStdin() {
    const chunks = [];
    for await (const chunk of process.stdin)
        chunks.push(chunk);
    return Buffer.concat(chunks).toString('utf-8');
}
async function main() {
    const inputJson = await readStdin();
    if (!inputJson.trim()) {
        console.log('{}');
        process.exit(0);
    }
    const input = JSON.parse(inputJson);
    const normalized = input.prompt.toLowerCase().trim();
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
    console.log('{}');
}
main();
//# sourceMappingURL=index.js.map