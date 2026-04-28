export function formatRoutingDecision(decision) {
    if (decision === null)
        return '{}';
    return JSON.stringify({
        hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: decision.guidance,
        },
    });
}
//# sourceMappingURL=routing-formatter.js.map