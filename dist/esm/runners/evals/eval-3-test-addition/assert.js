export async function assertEval3(events) {
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
    const mentionsTestOrMultiply = events.some((e) => {
        if (e.type === 'stdout') {
            return e.line.toLowerCase().includes('test') || e.line.toLowerCase().includes('multiply');
        }
        if (e.type === 'progress') {
            return (e.message.toLowerCase().includes('test') || e.message.toLowerCase().includes('multiply'));
        }
        return false;
    });
    if (!mentionsTestOrMultiply) {
        return {
            passed: false,
            reason: "no stdout or progress event mentions 'test' or 'multiply'",
        };
    }
    return { passed: true };
}
//# sourceMappingURL=assert.js.map