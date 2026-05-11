import { printHooksDoctor } from '#hooks/doctor';
export function registerHooksCommand(cli) {
    cli
        .command('hooks [action]', 'Verify plugin hook installation health (run: doctor)')
        .option('--skip-mcp', 'Skip MCP server liveness check (for CI)')
        .option('--hosts <mode>', 'Host smoke mode: auto | skip | required', {
        default: 'auto',
    })
        .option('--host <name>', 'Restrict host checks to codex | opencode | claude', {
        default: [],
    })
        .action(async (_action, options) => {
        const code = await printHooksDoctor({
            skipMcp: options.skipMcp,
            hosts: options.hosts,
            hostNames: options.host,
        });
        return code;
    });
}
//# sourceMappingURL=hooks.js.map