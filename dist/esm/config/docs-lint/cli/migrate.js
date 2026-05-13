#!/usr/bin/env tsx
function printHelp() {
    console.log(`docs-migrate

Migrate documentation files to use YAML frontmatter.

Usage:
  docs-migrate [options] [files...]

Options:
  --dry-run      Preview changes without writing files
  --backup       Create .bak files before modifying (default)
  --no-backup    Do not create .bak files
  --force        Force update even if frontmatter exists
  -v, --verbose  Verbose output
  -h, --help     Show this help
`);
}
function parseArgs(argv) {
    const files = [];
    const options = { help: false, backup: true };
    for (const arg of argv) {
        if (arg === '--help' || arg === '-h')
            options.help = true;
        else if (arg === '--dry-run')
            options.dryRun = true;
        else if (arg === '--backup')
            options.backup = true;
        else if (arg === '--no-backup')
            options.backup = false;
        else if (arg === '--force')
            options.force = true;
        else if (arg === '--verbose' || arg === '-v')
            options.verbose = true;
        else
            files.push(arg);
    }
    if (files.length > 0)
        options.files = files;
    return options;
}
const options = parseArgs(process.argv.slice(2));
if (options.help) {
    printHelp();
    process.exit(0);
}
const { help: _help, ...migrateOptions } = options;
const modulePath = './commands/migrate-command.ts';
const { createMigrateCommand } = await import(modulePath);
const exitCode = await createMigrateCommand().run(migrateOptions);
process.exit(exitCode);
export {};
//# sourceMappingURL=migrate.js.map