import { printHooksDoctor } from '#hooks/doctor';
async function runDoctor(options) {
    const hostNames = Array.isArray(options.host)
        ? options.host
        : options.host
            ? [options.host]
            : undefined;
    return await printHooksDoctor({
        skipMcp: options.skipMcp,
        fix: options.fix,
        hosts: options.hosts,
        hostNames,
    });
}
export function registerHooksCommand(cli) {
    cli
        .command('hooks [subcommand] [...args]', 'Verify plugin hook installation health (subcommands: doctor, status, dispatch, demo, upgrade)')
        .option('--skip-mcp', 'Skip MCP server liveness check (for CI)')
        .option('--fix', 'Attempt the safe manifest-backed hook restore path when doctor finds fixable drift')
        .option('--hosts <mode>', 'Host smoke mode: auto | skip | required', {
        default: 'auto',
    })
        .option('--host <name>', 'Restrict host checks to codex | opencode | claude', {
        default: [],
    })
        .option('--vendor <vendor>', 'Agent CLI to inspect/read hook config from: claude | codex')
        .option('--tool <tool>', 'Simulated tool name for hooks demo matcher routing, e.g. Bash or Write')
        .option('--dry-run', 'Print hooks that would fire without executing them (default: true)')
        .option('--workspace', 'Target every repo listed in ~/.agent/workspace.yaml')
        .option('--apply', 'Write the upgrade instead of previewing it')
        .action(async (subcommand, args, options) => {
        switch (subcommand) {
            case undefined:
            case 'doctor':
                return await runDoctor(options);
            case 'status': {
                const { statusCommand } = await import('#hooks/status/index.js');
                const extraArgs = options.vendor ? ['--vendor', options.vendor] : [];
                await statusCommand(extraArgs);
                return;
            }
            case 'dispatch': {
                const event = args[0];
                if (!event) {
                    throw new Error('Usage: wp hooks dispatch <event>');
                }
                const { dispatchCommand } = await import('#hooks/dispatch/index.js');
                const vendorArg = options.vendor === 'codex' ? 'codex' : 'claude';
                const extraArgs = [];
                if (options.dryRun === true)
                    extraArgs.push('--dry-run');
                await dispatchCommand([event, '--vendor', vendorArg, ...extraArgs]);
                return;
            }
            case 'demo': {
                const event = args[0];
                if (!event) {
                    throw new Error('Usage: wp hooks demo <event>');
                }
                const { demoCommand } = await import('#hooks/demo/index.js');
                const extraArgs = [event];
                if (options.vendor)
                    extraArgs.push('--vendor', options.vendor);
                if (options.tool)
                    extraArgs.push('--tool', options.tool);
                await demoCommand(extraArgs);
                return;
            }
            case 'upgrade': {
                const { hooksUpgradeCommand } = await import('#cli/commands/hooks-upgrade/index.js');
                const extraArgs = [];
                if (options.workspace === true)
                    extraArgs.push('--workspace');
                if (options.apply === true)
                    extraArgs.push('--apply');
                return await hooksUpgradeCommand(extraArgs);
            }
            default:
                throw new Error(`Unknown hooks subcommand: ${subcommand}\n\nUse one of: doctor, status, dispatch, demo, upgrade`);
        }
    });
}
//# sourceMappingURL=hooks.js.map