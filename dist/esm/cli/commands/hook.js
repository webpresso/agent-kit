const HOOK_NAMES = [
    'pretool-guard',
    'post-tool',
    'stop-qa',
    'guard-switch',
    'sessionstart-routing',
    'test-quality-check',
    'check-dev-link',
];
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
    'test-quality-check': async (args) => {
        const { runTestQualityCheck } = await import('#hooks/test-quality-check');
        runTestQualityCheck(args);
    },
    'check-dev-link': async () => {
        const { main } = await import('#hooks/check-dev-link/index');
        await main();
    },
};
export function isHookName(value) {
    return value in HOOK_HANDLERS;
}
export async function runHookCommand(name, args = []) {
    if (!isHookName(name)) {
        throw new Error(`Unknown hook "${name}". Expected one of: ${HOOK_NAMES.join(', ')}`);
    }
    await HOOK_HANDLERS[name](args);
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