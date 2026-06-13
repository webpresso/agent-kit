import { WP_HOOK_SPECS } from '#cli/commands/init/scaffolders/agent-hooks/ir.js';
const CURSOR_EVENT_MAP = {
    SessionStart: 'sessionStart',
    PreToolUse: 'preToolUse',
    PostToolUse: 'postToolUse',
    UserPromptSubmit: 'beforeSubmitPrompt',
    Stop: 'stop',
};
export function buildCursorHooksConfig(input) {
    const { resolveBin, matchers } = input;
    const config = { version: 1 };
    for (const spec of WP_HOOK_SPECS) {
        const event = CURSOR_EVENT_MAP[spec.event];
        if (event === undefined)
            continue;
        const group = {
            ...(spec.matcher !== undefined ? { matcher: matchers[spec.matcher] } : {}),
            ...(spec.event === 'PreToolUse' ? { failClosed: true } : {}),
            hooks: [{ type: 'command', command: resolveBin(spec.bin) }],
        };
        const existing = config[event] ?? [];
        config[event] = [...existing, group];
    }
    return config;
}
//# sourceMappingURL=cursor.js.map