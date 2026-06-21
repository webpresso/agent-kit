import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import envPaths from 'env-paths';
import lockfile from 'proper-lockfile';
import { SESSION_MEMORY_NATIVE_ADDON_FILENAME, resolveSessionMemoryNativeTarget, } from './native-targets.js';
const requireFromHere = createRequire(import.meta.url);
const NATIVE_WORKSPACE_DIRNAME = join('native', 'session-memory-engine');
const BUILD_PACKAGE = 'session-memory-napi';
const MODULE_BASENAME = 'session_memory_napi';
const BUILD_LOCK_STALE_MS = 10 * 60 * 1000;
const BUILD_LOCK_WAIT_MS = 10 * 60 * 1000;
const BUILD_LOCK_POLL_MS = 250;
let cachedModule = null;
export class NativeSessionMemoryUnavailableError extends Error {
    constructor(message) {
        super(message);
        this.name = 'NativeSessionMemoryUnavailableError';
    }
}
export class NativeSessionMemoryLoadError extends Error {
    constructor(message, options) {
        super(message, options);
        this.name = 'NativeSessionMemoryLoadError';
    }
}
export function resetNativeSessionMemoryEngineForTests() {
    cachedModule = null;
}
function resolvePackageRoot() {
    let cursor = resolve(dirname(fileURLToPath(import.meta.url)));
    while (true) {
        const packageJsonPath = join(cursor, 'package.json');
        if (existsSync(packageJsonPath)) {
            try {
                const pkg = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
                if (pkg.name === '@webpresso/agent-kit')
                    return cursor;
            }
            catch {
                // keep walking
            }
        }
        const parent = dirname(cursor);
        if (parent === cursor) {
            throw new Error('native session-memory engine could not locate the @webpresso/agent-kit package root');
        }
        cursor = parent;
    }
}
function sessionMemoryNativeCacheRoot() {
    const cacheDir = envPaths('webpresso-agent-kit').cache;
    const root = join(cacheDir, 'session-memory-engine');
    mkdirSync(root, { recursive: true });
    return root;
}
function buildWorkspaceRoot() {
    return join(resolvePackageRoot(), NATIVE_WORKSPACE_DIRNAME);
}
function buildManifestPath() {
    return join(buildWorkspaceRoot(), 'Cargo.toml');
}
function platformLibraryName() {
    switch (process.platform) {
        case 'darwin':
            return `lib${MODULE_BASENAME}.dylib`;
        case 'linux':
            return `lib${MODULE_BASENAME}.so`;
        case 'win32':
            return `${MODULE_BASENAME}.dll`;
        default:
            throw new Error(`native session-memory engine does not support platform ${process.platform}`);
    }
}
function compiledNodePath() {
    const cacheRoot = sessionMemoryNativeCacheRoot();
    const packageRoot = resolvePackageRoot();
    const workspaceRoot = buildWorkspaceRoot();
    const packageJson = JSON.parse(readFileSync(join(packageRoot, 'package.json'), 'utf8'));
    const cargoLock = readFileSync(join(workspaceRoot, 'Cargo.lock'), 'utf8');
    const fingerprint = createHash('sha256')
        .update(packageRoot)
        .update('\n')
        .update(workspaceRoot)
        .update('\n')
        .update(packageJson.version ?? '0')
        .update('\n')
        .update(cargoLock)
        .digest('hex')
        .slice(0, 16);
    const buildIdentity = `${packageJson.version ?? '0'}-${fingerprint}`;
    return join(cacheRoot, `${MODULE_BASENAME}.${buildIdentity}.${process.platform}-${process.arch}.node`);
}
function optionalNativePackageCandidate() {
    const target = resolveSessionMemoryNativeTarget();
    if (!target)
        return null;
    try {
        return requireFromHere.resolve(`${target.packageName}/${SESSION_MEMORY_NATIVE_ADDON_FILENAME}`);
    }
    catch (error) {
        const code = error?.code;
        if (code === 'MODULE_NOT_FOUND' || code === 'ERR_PACKAGE_PATH_NOT_EXPORTED')
            return null;
        throw error;
    }
}
function packagedNativeCandidates() {
    const packageRoot = resolvePackageRoot();
    const moduleDir = dirname(fileURLToPath(import.meta.url));
    const platformArch = `${process.platform}-${process.arch}`;
    return [
        optionalNativePackageCandidate(),
        join(moduleDir, `${MODULE_BASENAME}.${platformArch}.node`),
        join(moduleDir, `${MODULE_BASENAME}.node`),
        join(packageRoot, 'prebuilds', platformArch, `${MODULE_BASENAME}.node`),
        join(packageRoot, 'native', 'prebuilds', platformArch, `${MODULE_BASENAME}.node`),
    ].filter((candidate) => typeof candidate === 'string');
}
function resolvePrebuiltNativeModulePath() {
    const explicitPath = process.env['WP_NATIVE_SESSION_MEMORY_PATH'];
    if (explicitPath)
        return existsSync(explicitPath) ? explicitPath : null;
    for (const candidate of packagedNativeCandidates()) {
        if (existsSync(candidate))
            return candidate;
    }
    return null;
}
function isRepoCheckout() {
    const packageRoot = resolvePackageRoot();
    return existsSync(join(packageRoot, '.git')) && existsSync(buildManifestPath());
}
function nativeBuildFromSourceEnabled() {
    return process.env['WP_NATIVE_SESSION_MEMORY_BUILD_FROM_SOURCE'] === '1';
}
function describePrebuiltLookup() {
    const explicitPath = process.env['WP_NATIVE_SESSION_MEMORY_PATH'];
    const candidates = explicitPath ? [explicitPath] : packagedNativeCandidates();
    return candidates.map((candidate) => `- ${candidate}`).join('\n');
}
function resolveNativeModulePath() {
    const prebuiltPath = resolvePrebuiltNativeModulePath();
    if (prebuiltPath !== null)
        return prebuiltPath;
    if (!nativeBuildFromSourceEnabled()) {
        throw new NativeSessionMemoryUnavailableError(`native session-memory engine unavailable: no prebuilt addon found for ${process.platform}-${process.arch}. ` +
            `First-use cargo builds are disabled; set WP_NATIVE_SESSION_MEMORY_BUILD_FROM_SOURCE=1 in an agent-kit repo checkout to build from source. Searched:\n${describePrebuiltLookup()}`);
    }
    if (!isRepoCheckout()) {
        throw new NativeSessionMemoryUnavailableError('native session-memory engine unavailable: WP_NATIVE_SESSION_MEMORY_BUILD_FROM_SOURCE=1 was set, but this installation is not an agent-kit repo checkout with native sources');
    }
    return ensureNativeModuleBuilt();
}
function cargoTargetDir() {
    return join(sessionMemoryNativeCacheRoot(), 'cargo-target');
}
function newestNativeWorkspaceMtimeMs(nativeWorkspaceRoot) {
    let newest = 0;
    const stack = [nativeWorkspaceRoot];
    while (stack.length > 0) {
        const current = stack.pop();
        for (const entry of readdirSync(current, { withFileTypes: true })) {
            if (entry.name === 'target' || entry.name === '.git')
                continue;
            const entryPath = join(current, entry.name);
            if (entry.isDirectory()) {
                stack.push(entryPath);
            }
            else {
                newest = Math.max(newest, statSync(entryPath).mtimeMs);
            }
        }
    }
    return newest;
}
function shouldRebuild(nodePath, nativeWorkspaceRoot) {
    if (!existsSync(nodePath))
        return true;
    const builtAt = statSync(nodePath).mtimeMs;
    return newestNativeWorkspaceMtimeMs(nativeWorkspaceRoot) > builtAt;
}
function sleepSync(ms) {
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}
function acquireNativeBuildLock(lockTarget) {
    const started = Date.now();
    while (true) {
        try {
            return lockfile.lockSync(lockTarget, {
                realpath: false,
                stale: BUILD_LOCK_STALE_MS,
                update: 30_000,
            });
        }
        catch (error) {
            const code = error.code;
            if (code !== 'ELOCKED')
                throw error;
            if (Date.now() - started > BUILD_LOCK_WAIT_MS) {
                throw new Error(`Timed out waiting for native session-memory build lock at ${lockTarget}`);
            }
            sleepSync(BUILD_LOCK_POLL_MS);
        }
    }
}
function withNativeBuildLock(cacheRoot, build) {
    const lockTarget = join(cacheRoot, '.build.lock');
    const release = acquireNativeBuildLock(lockTarget);
    try {
        return build();
    }
    finally {
        release();
    }
}
function ensureNativeModuleBuilt() {
    const workspaceRoot = buildWorkspaceRoot();
    const manifestPath = buildManifestPath();
    const nodePath = compiledNodePath();
    if (!shouldRebuild(nodePath, workspaceRoot))
        return nodePath;
    return withNativeBuildLock(sessionMemoryNativeCacheRoot(), () => {
        if (!shouldRebuild(nodePath, workspaceRoot))
            return nodePath;
        const targetDir = cargoTargetDir();
        mkdirSync(targetDir, { recursive: true });
        try {
            execFileSync(process.env['CARGO'] || 'cargo', [
                'build',
                '--manifest-path',
                manifestPath,
                '--package',
                BUILD_PACKAGE,
                '--release',
                '--locked',
            ], {
                cwd: workspaceRoot,
                stdio: 'pipe',
                encoding: 'utf8',
                env: {
                    ...process.env,
                    CARGO_TARGET_DIR: targetDir,
                    TMPDIR: process.env['TMPDIR'] || tmpdir(),
                },
            });
        }
        catch (error) {
            const failure = error;
            const detail = [failure.message, failure.stdout, failure.stderr].filter(Boolean).join('\n');
            throw new Error(`native session-memory engine build failed. Expected cargo to build ${BUILD_PACKAGE} from ${manifestPath}. ${detail}`);
        }
        const builtLibraryPath = join(targetDir, 'release', platformLibraryName());
        if (!existsSync(builtLibraryPath)) {
            throw new Error(`native session-memory engine build completed but did not produce ${builtLibraryPath}`);
        }
        mkdirSync(dirname(nodePath), { recursive: true });
        copyFileSync(builtLibraryPath, nodePath);
        return nodePath;
    });
}
export function loadNativeSessionMemoryEngine() {
    if (cachedModule !== null)
        return cachedModule;
    const nodePath = resolveNativeModulePath();
    let loaded;
    try {
        loaded = requireFromHere(nodePath);
    }
    catch (error) {
        throw new NativeSessionMemoryLoadError(`native session-memory engine failed to load from ${nodePath}: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }
    const loadedRecord = typeof loaded === 'object' && loaded !== null ? loaded : null;
    const defaultRecord = loadedRecord !== null &&
        typeof loadedRecord['default'] === 'object' &&
        loadedRecord['default'] !== null
        ? loadedRecord['default']
        : null;
    const candidate = (loadedRecord !== null && typeof loadedRecord['index'] === 'function'
        ? loadedRecord
        : defaultRecord !== null && typeof defaultRecord['index'] === 'function'
            ? defaultRecord
            : null);
    const requiredKeys = [
        'index',
        'search',
        'captureEvent',
        'flushEvents',
        'snapshot',
        'restore',
        'executeSandboxed',
    ];
    if (candidate === null || requiredKeys.some((key) => typeof candidate[key] !== 'function')) {
        throw new NativeSessionMemoryLoadError(`native session-memory engine loaded from ${nodePath} but did not expose the expected API`);
    }
    cachedModule = candidate;
    return cachedModule;
}
//# sourceMappingURL=native-runtime.js.map