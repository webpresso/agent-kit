export const RUNTIME_BINARY_NAME = 'wp';
export const RUNTIME_TARGETS = [
    {
        id: 'darwin-arm64',
        bunTarget: 'bun-darwin-arm64',
        os: 'darwin',
        cpu: 'arm64',
        packageName: '@webpresso/agent-kit-runtime-darwin-arm64',
    },
    {
        id: 'darwin-x64',
        bunTarget: 'bun-darwin-x64',
        os: 'darwin',
        cpu: 'x64',
        packageName: '@webpresso/agent-kit-runtime-darwin-x64',
    },
    {
        id: 'linux-x64',
        bunTarget: 'bun-linux-x64',
        os: 'linux',
        cpu: 'x64',
        packageName: '@webpresso/agent-kit-runtime-linux-x64',
    },
    {
        id: 'linux-arm64',
        bunTarget: 'bun-linux-arm64',
        os: 'linux',
        cpu: 'arm64',
        packageName: '@webpresso/agent-kit-runtime-linux-arm64',
    },
    {
        id: 'windows-x64',
        bunTarget: 'bun-windows-x64',
        os: 'win32',
        cpu: 'x64',
        packageName: '@webpresso/agent-kit-runtime-windows-x64',
    },
];
export function runtimeBinaryFilename(target) {
    return target.os === 'win32' ? `${RUNTIME_BINARY_NAME}.exe` : RUNTIME_BINARY_NAME;
}
export function runtimePackageDirName(packageName) {
    return packageName.split('/').at(-1) ?? packageName;
}
export function resolveRuntimeTarget(platform = process.platform, arch = process.arch) {
    return RUNTIME_TARGETS.find((target) => target.os === platform && target.cpu === arch);
}
//# sourceMappingURL=runtime-targets.js.map