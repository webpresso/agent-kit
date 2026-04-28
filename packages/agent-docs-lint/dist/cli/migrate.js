#!/usr/bin/env tsx
import { defineCommand, runMain } from 'citty';
import { createMigrateCommand } from './commands/migrate-command';
const main = defineCommand({
    meta: {
        name: 'docs-migrate',
        description: 'Migrate documentation files to use YAML frontmatter',
    },
    args: {
        files: {
            type: 'positional',
            description: 'Files to migrate (optional)',
            required: false,
        },
        'dry-run': {
            type: 'boolean',
            description: 'Preview changes without writing files',
            default: false,
        },
        backup: {
            type: 'boolean',
            description: 'Create .bak files before modifying',
            default: true,
        },
        force: {
            type: 'boolean',
            description: 'Force update even if frontmatter exists',
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
            dryRun: args['dry-run'],
            backup: args.backup,
            force: args.force,
            verbose: args.verbose,
        };
        const cmd = createMigrateCommand();
        const exitCode = await cmd.run(options);
        process.exit(exitCode);
    },
});
runMain(main);
