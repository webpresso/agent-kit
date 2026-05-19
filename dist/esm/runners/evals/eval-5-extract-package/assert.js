export async function assertEval5(events) {
    const completedEvent = events.find((e) => e.type === 'completed');
    if (completedEvent === undefined) {
        return { passed: false, reason: "no 'completed' event found in event stream" };
    }
    if (completedEvent.exitCode !== 0) {
        return {
            passed: false,
            reason: `'completed' event has exitCode ${completedEvent.exitCode}, expected 0`,
        };
    }
    // Check for byte-identity failure markers before checking for success keywords.
    // A 'FAIL' or 'mismatch' in the output means the extraction had drift — even if
    // exitCode is 0, the parity check failed and the eval must not pass.
    const hasByteIdentityFailure = events.some((e) => {
        if (e.type === 'stdout') {
            const line = e.line;
            return line.includes('FAIL') || line.includes('mismatch');
        }
        if (e.type === 'progress') {
            const msg = e.message;
            return msg.includes('FAIL') || msg.includes('mismatch');
        }
        return false;
    });
    if (hasByteIdentityFailure) {
        return {
            passed: false,
            reason: "stdout or progress event reports a byte-identity failure ('FAIL' or 'mismatch')",
        };
    }
    // Require evidence that parity verification was actually performed.
    const mentionsParity = events.some((e) => {
        if (e.type === 'stdout') {
            const line = e.line.toLowerCase();
            return (line.includes('byte') ||
                line.includes('identity') ||
                line.includes('parity') ||
                line.includes('extract'));
        }
        if (e.type === 'progress') {
            const msg = e.message.toLowerCase();
            return (msg.includes('byte') ||
                msg.includes('identity') ||
                msg.includes('parity') ||
                msg.includes('extract'));
        }
        return false;
    });
    if (!mentionsParity) {
        return {
            passed: false,
            reason: "no stdout or progress event mentions 'byte', 'identity', 'parity', or 'extract' — parity verification not evidenced",
        };
    }
    return { passed: true };
}
//# sourceMappingURL=assert.js.map