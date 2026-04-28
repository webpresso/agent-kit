import { printHooksDoctor } from '#hooks/doctor';
export function registerHooksCommand(cli) {
    cli
        .command('hooks doctor', 'Verify plugin hook installation health')
        .option('--skip-mcp', 'Skip MCP server liveness check (for CI)')
        .action(async (options) => {
        const code = await printHooksDoctor({ skipMcp: options.skipMcp });
        process.exit(code);
    });
}
//# sourceMappingURL=hooks.js.map