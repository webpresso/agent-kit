export async function assertEval4(events) {
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
    const mentionsDependency = events.some((e) => {
        if (e.type === 'stdout') {
            const line = e.line.toLowerCase();
            return line.includes('zod') || line.includes('bump') || line.includes('version');
        }
        if (e.type === 'progress') {
            const msg = e.message.toLowerCase();
            return msg.includes('zod') || msg.includes('bump') || msg.includes('version');
        }
        return false;
    });
    if (!mentionsDependency) {
        return {
            passed: false,
            reason: "no stdout or progress event mentions 'zod', 'bump', or 'version'",
        };
    }
    return { passed: true };
}
//# sourceMappingURL=assert.js.map