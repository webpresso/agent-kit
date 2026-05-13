export async function assertEval2(events) {
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
    const mentionsClampOrExtract = events.some((e) => {
        if (e.type === 'stdout') {
            const lower = e.line.toLowerCase();
            return lower.includes('clamp') || lower.includes('extract');
        }
        if (e.type === 'progress') {
            const lower = e.message.toLowerCase();
            return lower.includes('clamp') || lower.includes('extract');
        }
        return false;
    });
    if (!mentionsClampOrExtract) {
        return {
            passed: false,
            reason: "no stdout or progress event mentions 'clamp' or 'extract'",
        };
    }
    return { passed: true };
}
//# sourceMappingURL=assert.js.map