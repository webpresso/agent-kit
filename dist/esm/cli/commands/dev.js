import { loadDevManifest, resolveDevServices } from '#dev/index';
export function getDevHelpText() {
    return [
        'Usage: wp dev [target] [options]',
        '',
        'Options:',
        '  --manifest <path>  Dev manifest path',
        '  --doctor           Validate manifest and print resolved services',
        '  --clean            Clean supervisor-owned state for the target',
        '  --restart          Restart the target',
        '  -h, --help         Display this message',
        '',
        'Manifest precedence: --manifest -> AK_APP_MANIFEST -> ./app-manifest.yaml -> error',
    ].join('\n');
}
export async function runDevCommand(input) {
    const mode = input.mode ?? 'start';
    const { manifestPath, manifest } = loadDevManifest({
        cwd: input.cwd,
        manifestPath: input.manifestPath,
    });
    const services = resolveDevServices(manifest, input.target);
    return { mode, manifestPath, services };
}
export function registerDevCommand(cli) {
    cli
        .command('dev [target]', 'Run a manifest-backed development target')
        .option('--manifest <path>', 'Dev manifest path (precedence: --manifest -> AK_APP_MANIFEST -> ./app-manifest.yaml -> error)')
        .option('--doctor', 'Validate manifest and print resolved services')
        .option('--clean', 'Clean supervisor-owned state for the target')
        .option('--restart', 'Restart the target')
        .action(async (target, options) => {
        if (options.clean && options.restart) {
            throw new Error('Use either --clean or --restart, not both.');
        }
        const mode = options.doctor
            ? 'doctor'
            : options.clean
                ? 'clean'
                : options.restart
                    ? 'restart'
                    : 'start';
        const result = await runDevCommand({
            manifestPath: options.manifest,
            mode,
            target,
        });
        console.log(JSON.stringify({
            mode: result.mode,
            manifest: result.manifestPath,
            services: result.services,
        }, null, 2));
        process.exit(0);
    });
}
//# sourceMappingURL=dev.js.map