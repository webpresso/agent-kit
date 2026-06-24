import { recordHookError } from '#hooks/errors/index.js';
const HOOK_NAMES = [
    'pretool-guard',
    'post-tool',
    'stop-qa',
    'guard-switch',
    'sessionstart-routing',
    'precompact-snapshot',
    'test-quality-check',
];
const HOOK_METADATA = {
    'pretool-guard': {
        binName: 'wp-pretool-guard',
        event: 'PreToolUse',
        fallback: 'fail-closed-deny',
    },
    'post-tool': { binName: 'wp-post-tool', event: 'PostToolUse', fallback: 'fail-open' },
    'stop-qa': { binName: 'wp-stop-qa', event: 'Stop', fallback: 'emit-empty-json' },
    'guard-switch': { binName: 'wp-guard-switch', event: 'UserPromptSubmit', fallback: 'fail-open' },
    'sessionstart-routing': {
        binName: 'wp-sessionstart-routing',
        event: 'SessionStart',
        fallback: 'fail-open',
    },
    'precompact-snapshot': {
        binName: 'wp-precompact-snapshot',
        event: 'PreCompact',
        fallback: 'emit-empty-json',
    },
    'test-quality-check': {
        binName: 'wp-test-quality-check',
        event: 'TestQualityCheck',
        fallback: 'fail-open',
    },
};
const HOOK_HANDLERS = {
    'pretool-guard': async () => {
        const { main } = await import('#hooks/pretool-guard/index');
        await main();
    },
    'post-tool': async () => {
        const { main } = await import('#hooks/post-tool/lint-after-edit');
        await main();
    },
    'stop-qa': async () => {
        const { main } = await import('#hooks/stop/qa-changed-files');
        await main();
    },
    'guard-switch': async () => {
        const { main } = await import('#hooks/guard-switch/index');
        await main();
    },
    'sessionstart-routing': async () => {
        const { main } = await import('#hooks/sessionstart/index');
        await main();
    },
    'precompact-snapshot': async () => {
        const { main } = await import('#hooks/precompact/index');
        await main();
    },
    'test-quality-check': async (args) => {
        const { runTestQualityCheck } = await import('#hooks/test-quality-check');
        runTestQualityCheck(args);
    },
};
function errorDetail(error) {
    return error instanceof Error ? error.message : String(error ?? '');
}
function writePretoolDeny(reason) {
    process.stdout.write(`${JSON.stringify({
        hookSpecificOutput: {
            hookEventName: 'PreToolUse',
            permissionDecision: 'deny',
            permissionDecisionReason: reason,
        },
    })}\n`);
}
function emitFallback(name, error) {
    const metadata = HOOK_METADATA[name];
    const detail = errorDetail(error);
    recordHookError({
        binName: metadata.binName,
        hookName: name,
        event: metadata.event,
        phase: 'handler',
        fallback: metadata.fallback,
        detail,
    });
    if (metadata.fallback === 'fail-closed-deny') {
        writePretoolDeny(`webpresso pretool guard failed: ${detail}`);
        return;
    }
    if (metadata.fallback === 'emit-empty-json') {
        process.stdout.write('{}\n');
        return;
    }
    process.stderr.write(`webpresso hook ${metadata.binName} degraded: hook=${name} event=${metadata.event} fallback=${metadata.fallback}: ${detail}\n`);
}
export function isHookName(value) {
    return value in HOOK_HANDLERS;
}
export async function runHookCommand(name, args = []) {
    if (!isHookName(name)) {
        throw new Error(`Unknown hook "${name}". Expected one of: ${HOOK_NAMES.join(', ')}`);
    }
    try {
        await HOOK_HANDLERS[name](args);
    }
    catch (error) {
        emitFallback(name, error);
    }
}
export function registerHookCommand(cli) {
    cli
        .command('hook <name> [...args]', 'Run an internal plugin hook entrypoint')
        .action(async (name, args) => {
        await runHookCommand(name, args);
        return 0;
    });
}
//# sourceMappingURL=hook.js.map