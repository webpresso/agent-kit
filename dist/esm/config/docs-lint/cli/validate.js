#!/usr/bin/env tsx
function printHelp() {
    console.log(`docs validate

Validate documentation files.

Usage:
  docs-lint [options] [files...]

Options:
  --staged       Only validate staged files
  --fix          Auto-fix issues where possible
  -v, --verbose  Verbose output
  -h, --help     Show this help
`);
}
function parseArgs(argv) {
    const files = [];
    const options = { help: false };
    for (const arg of argv) {
        if (arg === '--help' || arg === '-h')
            options.help = true;
        else if (arg === '--staged')
            options.staged = true;
        else if (arg === '--fix')
            options.fix = true;
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
const { help: _help, ...validateOptions } = options;
const modulePath = './commands/validate-command.ts';
const { createValidateCommand } = await import(modulePath);
const exitCode = await createValidateCommand().run(validateOptions);
process.exit(exitCode);
export {};
//# sourceMappingURL=validate.js.map