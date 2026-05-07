import { printHooksDoctor } from '#hooks/doctor';
export function registerHooksCommand(cli) {
    cli
        .command('hooks [action]', 'Verify plugin hook installation health (run: doctor)')
        .option('--skip-mcp', 'Skip MCP server liveness check (for CI)')
        .action(async (_action, options) => {
        const code = await printHooksDoctor({ skipMcp: options.skipMcp });
        return code;
    });
}
//# sourceMappingURL=hooks.js.map