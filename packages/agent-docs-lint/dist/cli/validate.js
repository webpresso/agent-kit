#!/usr/bin/env tsx
import { defineCommand, runMain } from 'citty';
import { createValidateCommand } from './commands/validate-command.js';
// Track exit code from the command
let commandExitCode = 0;
const main = defineCommand({
    meta: {
        name: 'docs validate',
        description: 'Validate documentation files',
    },
    args: {
        files: {
            type: 'positional',
            description: 'Files to validate (optional)',
            required: false,
        },
        staged: {
            type: 'boolean',
            description: 'Only validate staged files',
            default: false,
        },
        fix: {
            type: 'boolean',
            description: 'Auto-fix issues where possible',
            default: false,
        },
        verbose: {
            type: 'boolean',
            alias: 'v',
            description: 'Verbose output',
            default: false,
        },
    },
    async run({ args }) {
        const options = {
            files: args.files ? [args.files].flat() : undefined,
            staged: args.staged,
            fix: args.fix,
            verbose: args.verbose,
        };
        const cmd = createValidateCommand();
        commandExitCode = await cmd.run(options);
    },
});
// Force exit immediately after runMain completes to prevent hanging
// Dependencies like tinyglobby and consola keep the event loop alive
void runMain(main).then(() => {
    process.exit(commandExitCode);
});
