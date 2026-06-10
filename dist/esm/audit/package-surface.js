import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { createPackedManifest, readWorkspaceCatalogs } from '#build/package-manifest.js';
import { AGENT_KIT_TARBALL_SIZE_BUDGET_BYTES, AGENT_KIT_TARBALL_UNPACKED_SIZE_BUDGET_BYTES, evaluateAgentKitTarballSizeBudget, } from '#build/runtime-surface-policy.js';
import { formatRootLauncherContractFailure, rootContractMode, validateRootLauncherContract, } from '#launcher/root-contract.js';
const DEFAULT_ALLOWED_PUBLIC_PACKAGES = [
    '@webpresso/webpresso',
    '@webpresso/agent-kit',
    'webpresso',
];
const DEFAULT_COMPATIBILITY_PUBLIC_PACKAGES = [
    '@webpresso/codegen-core',
    '@webpresso/codegen-generator',
    '@webpresso/codegen-plugins-saas',
    '@webpresso/db-branching',
    '@webpresso/db-branching-neon',
    '@webpresso/layout-compiler',
    '@webpresso/layout-schema',
    '@webpresso/schema-engine',
    '@webpresso/schema-frontend',
    '@webpresso/schema-loaders',
    '@webpresso/schema-spec',
    '@webpresso/ui',
    '@webpresso/ui-react',
    '@webpresso/ui-theme',
    '@webpresso/ui-i18n',
];
const DEFAULT_FORBIDDEN_PUBLIC_NAME_PATTERNS = [
    '@webpresso/db-branching-neon',
    '@webpresso/neon',
    '@webpresso/neon-core',
    '@webpresso/neon-branching',
    '@webpresso/cloudflare-pulumi',
    '@webpresso/doppler-pulumi',
];
const DEFAULT_STALE_LINKS = [];
const DEFAULT_REFERENCE_BASELINES = {
    webpresso: '0.18.18',
    '@webpresso/db-branching': '0.2.4',
    '@webpresso/db-branching-neon': '0.2.4',
};
const SKIP_DIRECTORIES = new Set([
    '.git',
    '.agent',
    '.agents',
    '.claude',
    '.codex',
    '.omx',
    '.omc',
    '.stryker-tmp',
    '.webpresso-packed-surface',
    'node_modules',
    'dist',
    'build',
    'coverage',
    '.next',
    '.turbo',
    '.wrangler',
]);
const PUBLIC_DOC_FILENAMES = new Set(['README.md', 'AGENTS.md', 'CLAUDE.md', 'VISION.md']);
const SCANNED_EXTENSIONS = new Set(['.md', '.mdx', '.json', '.yaml', '.yml', '.ts', '.tsx', '.js']);
const IGNORED_SCAN_BASENAMES = new Set(['CHANGELOG.md', 'pnpm-lock.yaml', 'package-lock.json']);
const SECRETLINT_EXTENSIONS = new Set([
    '.cjs',
    '.cts',
    '.js',
    '.json',
    '.md',
    '.mdx',
    '.mjs',
    '.mts',
    '.sh',
    '.sql',
    '.template',
    '.tmpl',
    '.tpl',
    '.ts',
    '.tsx',
    '.txt',
    '.yaml',
    '.yml',
]);
const DEFAULT_FORBIDDEN_TARBALL_PATH_PATTERNS = [
    '.agent/',
    '.agents/',
    '.claude/',
    '.codex/',
    '.cursor/',
    '.gemini/',
    '.omc/',
    '.omx/',
    '.opencode/',
    '.windsurf/',
    'docs/research/',
];
const DEFAULT_FORBIDDEN_TARBALL_CONTENT_PATTERNS = [
    '/\\/Users\\/[A-Za-z0-9._-]+/',
    '/@(?:repo)\\//',
    '/gh[pousr]_[A-Za-z0-9_]{20,}/',
    '/npm_[A-Za-z0-9]{36,}/',
    '/sk-ant-[A-Za-z0-9_-]{20,}/',
    '/sk-[A-Za-z0-9]{32,}/',
    '/-----BEGIN [A-Z ]*PRIVATE KEY-----/',
];
const DEFAULT_DEEP_SCAN_EXCLUDED_PATH_PREFIXES = ['dist/'];
const SECRETLINT_DEFAULT_CONFIG = JSON.stringify({
    rules: [{ id: '@secretlint/secretlint-rule-preset-recommend' }],
});
export function auditPackageSurface(rootDirectory = process.cwd()) {
    const root = resolve(rootDirectory);
    const loadedContract = loadPackageSurfaceContract(root);
    const contract = loadedContract.contract;
    const violations = [];
    let checked = 0;
    const allowedPackages = new Set([
        ...DEFAULT_ALLOWED_PUBLIC_PACKAGES,
        ...(contract.allowedPublicPackages ?? []),
    ]);
    const compatibilityPackages = new Set([
        ...DEFAULT_COMPATIBILITY_PUBLIC_PACKAGES,
        ...(contract.compatibilityPublicPackages ?? []),
    ]);
    const forbiddenPatterns = contract.forbiddenPublicNamePatterns ?? DEFAULT_FORBIDDEN_PUBLIC_NAME_PATTERNS;
    const staleLinks = contract.staleLinks ?? DEFAULT_STALE_LINKS;
    const baselines = contract.referenceConsumerBaselines ?? DEFAULT_REFERENCE_BASELINES;
    for (const packageFile of walkFiles(root, (file) => basename(file) === 'package.json')) {
        const pkg = readJsonObject(packageFile);
        if (!pkg.name?.startsWith('@webpresso/') && pkg.name !== 'webpresso')
            continue;
        checked += 1;
        if (pkg.private === true)
            continue;
        if (allowedPackages.has(pkg.name) || compatibilityPackages.has(pkg.name))
            continue;
        violations.push({
            file: relativePath(root, packageFile),
            message: `${pkg.name} is publishable but is not in the package-surface contract`,
        });
    }
    if (loadedContract.exists) {
        for (const file of discoverPublicSurfaceFiles(root)) {
            checked += 1;
            const text = readText(file);
            if (!text)
                continue;
            for (const pattern of forbiddenPatterns) {
                if (!hasActionableForbiddenMention(text, pattern))
                    continue;
                violations.push({
                    file: relativePath(root, file),
                    message: `Public surface mentions forbidden vendor-branded package ${pattern}`,
                });
            }
            for (const staleLink of staleLinks) {
                if (!text.includes(staleLink))
                    continue;
                violations.push({
                    file: relativePath(root, file),
                    message: `Public surface links to stale package-surface path ${staleLink}`,
                });
            }
        }
    }
    if (baselines) {
        checked += auditReferenceConsumerFreshness(root, baselines, violations);
    }
    checked += auditPackedTarballSurface(root, contract, violations);
    return {
        ok: violations.length === 0,
        title: 'Package surface',
        checked,
        violations,
    };
}
export function stagePublishableTarballSurface(rootDirectory, destinationDirectory) {
    const root = resolve(rootDirectory);
    const destinationRoot = resolve(destinationDirectory);
    rmSync(destinationRoot, { recursive: true, force: true });
    mkdirSync(destinationRoot, { recursive: true });
    const packages = discoverPublishablePackages(root);
    let fileCount = 0;
    for (const candidate of packages) {
        const packEntry = readPackedEntry(candidate.packageRoot);
        const packedFiles = Array.isArray(packEntry.files)
            ? packEntry.files.filter((item) => Boolean(item?.path))
            : [];
        stagePackedFiles(root, destinationRoot, candidate, packedFiles);
        fileCount += packedFiles.length;
    }
    return { packageCount: packages.length, fileCount };
}
function loadPackageSurfaceContract(root) {
    const candidates = [
        join(root, 'package-surface.json'),
        join(root, '.webpresso', 'package-surface.json'),
        join(root, 'webpresso', 'package-surface.json'),
    ];
    for (const candidate of candidates) {
        if (!existsSync(candidate))
            continue;
        return { contract: readJsonObject(candidate), exists: true };
    }
    return { contract: {}, exists: false };
}
function discoverPublicSurfaceFiles(root) {
    const files = new Set();
    for (const name of PUBLIC_DOC_FILENAMES) {
        const file = join(root, name);
        if (existsSync(file))
            files.add(file);
    }
    for (const packageFile of walkFiles(root, (file) => basename(file) === 'package.json')) {
        const packageRoot = dirname(packageFile);
        for (const name of PUBLIC_DOC_FILENAMES) {
            const file = join(packageRoot, name);
            if (existsSync(file))
                files.add(file);
        }
    }
    // Root docs are public documentation; recursively scan them, but avoid heavy
    // generated/runtime directories elsewhere.
    const docsRoot = join(root, 'docs');
    if (existsSync(docsRoot)) {
        for (const file of walkFiles(docsRoot, isScannablePublicFile))
            files.add(file);
    }
    return [...files].toSorted((left, right) => left.localeCompare(right));
}
function auditPackedTarballSurface(root, contract, violations) {
    const packages = discoverPublishablePackages(root);
    if (packages.length === 0)
        return 0;
    const tarball = contract.tarball ?? {};
    const forbiddenPathRules = compileMatchRules([
        ...DEFAULT_FORBIDDEN_TARBALL_PATH_PATTERNS,
        ...(tarball.forbiddenPathPatterns ?? []),
    ]);
    const allowedPathRules = compileMatchRules(tarball.allowedPathPatterns ?? []);
    const forbiddenContentRules = compileMatchRules([
        ...DEFAULT_FORBIDDEN_TARBALL_CONTENT_PATTERNS,
        ...(tarball.forbiddenContentPatterns ?? []),
    ]);
    const allowedContentRules = compileMatchRules(tarball.allowedContentPatterns ?? []);
    const allowedSecretlintMessageIds = new Set(tarball.allowedSecretlintMessageIds ?? []);
    const deepScanExcludedPathPrefixes = [
        ...DEFAULT_DEEP_SCAN_EXCLUDED_PATH_PREFIXES,
        ...(tarball.deepScanExcludedPathPrefixes ?? []),
    ];
    let checked = 0;
    for (const candidate of packages) {
        let packEntry;
        try {
            packEntry = readPackedEntry(candidate.packageRoot);
        }
        catch (error) {
            violations.push({
                file: relativePath(root, candidate.packageFile),
                message: `npm pack --dry-run --json failed for ${candidate.name}: ${errorMessage(error)}`,
            });
            checked += 1;
            continue;
        }
        const packedFiles = Array.isArray(packEntry.files)
            ? packEntry.files.filter((item) => Boolean(item?.path))
            : [];
        checked += packedFiles.length;
        for (const packedFile of packedFiles) {
            const repoRelative = packageFileToRepoRelative(root, candidate, packedFile.path);
            if (matchesAny(forbiddenPathRules, packedFile.path, repoRelative) &&
                !matchesAny(allowedPathRules, packedFile.path, repoRelative)) {
                violations.push({
                    file: repoRelative,
                    message: `Packed tarball path ${packedFile.path} matches a forbidden path policy`,
                });
            }
        }
        checked += auditAgentKitNativeRuntimeSurface(root, candidate, packEntry, packedFiles, violations);
        checked += auditPackedTarballContent(root, candidate, packedFiles, forbiddenContentRules, allowedContentRules, allowedPathRules, deepScanExcludedPathPrefixes, violations);
        checked += auditPackedTarballSecrets(root, candidate, packedFiles, forbiddenPathRules, allowedPathRules, allowedSecretlintMessageIds, deepScanExcludedPathPrefixes, violations);
    }
    return checked;
}
/**
 * Build the PACKED manifest (what actually ships) for the native-runtime
 * surface check. `createPackedManifest` wires the
 * `@webpresso/agent-kit-runtime-*` optionalDependencies to the package version
 * at pack time, so the committed package.json deliberately omits them —
 * committing them would pin the lockfile to a runtime version that is only
 * published during the same release and deadlock the publish job's frozen
 * install (see scripts/release-publish.ts).
 */
function computePackedManifest(packageRoot, packageJsonPath) {
    const manifest = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    const workspacePath = join(packageRoot, 'pnpm-workspace.yaml');
    const workspaceCatalogs = existsSync(workspacePath)
        ? readWorkspaceCatalogs(workspacePath)
        : { catalog: undefined, catalogs: undefined };
    return createPackedManifest(manifest, workspaceCatalogs);
}
function auditAgentKitNativeRuntimeSurface(root, candidate, packEntry, packedFiles, violations) {
    if (candidate.name !== '@webpresso/agent-kit')
        return 0;
    const manifestPath = join(candidate.packageRoot, 'bin', 'runtime-manifest.json');
    if (!existsSync(manifestPath)) {
        violations.push({
            file: relativePath(root, join(candidate.packageRoot, 'bin', 'runtime-manifest.json')),
            message: 'Native runtime manifest is missing from the publishable package surface',
        });
        return 1;
    }
    const packedManifest = computePackedManifest(candidate.packageRoot, candidate.packageFile);
    const runtimeManifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
    const packedPaths = new Set(packedFiles.map((file) => file.path));
    const requiredPackedPaths = new Set(['bin/runtime-manifest.json', 'bin/wp']);
    const deniedPackedPrefixes = ['bin/runtime/', 'dist/runtime/', 'dist/runtime-packages/'];
    for (const requiredPath of requiredPackedPaths) {
        if (packedPaths.has(requiredPath))
            continue;
        violations.push({
            file: relativePath(root, join(candidate.packageRoot, requiredPath)),
            message: `Publishable tarball is missing required native runtime artifact ${requiredPath}`,
        });
    }
    for (const packedPath of packedPaths) {
        if (!deniedPackedPrefixes.some((prefix) => packedPath.startsWith(prefix)))
            continue;
        violations.push({
            file: relativePath(root, join(candidate.packageRoot, packedPath)),
            message: `Publishable tarball contains denied native runtime payload ${packedPath}`,
        });
    }
    for (const target of runtimeManifest.targets ?? []) {
        if (!target.packageName) {
            violations.push({
                file: relativePath(root, manifestPath),
                message: 'Runtime manifest target is missing packageName for optional runtime wiring',
            });
            continue;
        }
        const declaredVersion = packedManifest.optionalDependencies?.[target.packageName];
        if (declaredVersion !== packedManifest.version) {
            violations.push({
                file: relativePath(root, candidate.packageFile),
                message: `Packed runtime optional dependency ${target.packageName} must be wired to package version ` +
                    `${packedManifest.version ?? '<missing>'}; found ${declaredVersion ?? '<missing>'}`,
            });
        }
    }
    const stagedLauncherPath = join(candidate.packageRoot, 'bin', 'wp');
    const stagedLauncherStatus = validateRootLauncherContract(stagedLauncherPath);
    if (!stagedLauncherStatus.ok) {
        violations.push({
            file: relativePath(root, stagedLauncherPath),
            message: `Publishable root launcher contract failed (${rootContractMode}): ` +
                formatRootLauncherContractFailure(stagedLauncherStatus, 'bin/wp'),
        });
    }
    const sizeBudget = evaluateAgentKitTarballSizeBudget(packEntry);
    if (!sizeBudget.sizeOk || !sizeBudget.unpackedOk) {
        violations.push({
            file: relativePath(root, candidate.packageFile),
            message: `Publishable tarball exceeds native-runtime size budget: size=${sizeBudget.size}/` +
                `${AGENT_KIT_TARBALL_SIZE_BUDGET_BYTES}, unpacked=${sizeBudget.unpackedSize}/` +
                `${AGENT_KIT_TARBALL_UNPACKED_SIZE_BUDGET_BYTES}`,
        });
    }
    return requiredPackedPaths.size + 3 + packedFiles.length + (runtimeManifest.targets?.length ?? 0);
}
function auditPackedTarballContent(root, candidate, packedFiles, forbiddenRules, allowedRules, allowedPathRules, deepScanExcludedPathPrefixes, violations) {
    let checked = 0;
    for (const packedFile of packedFiles) {
        const repoRelative = packageFileToRepoRelative(root, candidate, packedFile.path);
        if (matchesAny(allowedPathRules, packedFile.path, repoRelative))
            continue;
        if (isExcludedFromDeepScan(packedFile.path, repoRelative, deepScanExcludedPathPrefixes))
            continue;
        const text = readPackedText(join(candidate.packageRoot, packedFile.path));
        if (text === undefined)
            continue;
        checked += 1;
        for (const rule of forbiddenRules) {
            if (!rule.matches(text))
                continue;
            if (allowedRules.some((allowed) => allowed.matches(text)))
                continue;
            violations.push({
                file: repoRelative,
                message: `Packed tarball content matches forbidden pattern ${rule.raw}`,
            });
        }
    }
    return checked;
}
function auditPackedTarballSecrets(root, candidate, packedFiles, forbiddenPathRules, allowedPathRules, allowedMessageIds, deepScanExcludedPathPrefixes, violations) {
    const packageRelativeRoot = relativePath(root, candidate.packageRoot);
    const secretlintCandidates = packedFiles.filter((packedFile) => {
        const repoRelative = packageFileToRepoRelative(root, candidate, packedFile.path);
        if (matchesAny(allowedPathRules, packedFile.path, repoRelative))
            return false;
        if (matchesAny(forbiddenPathRules, packedFile.path, repoRelative))
            return false;
        if (isExcludedFromDeepScan(packedFile.path, repoRelative, deepScanExcludedPathPrefixes)) {
            return false;
        }
        return isSecretlintCandidate(packedFile.path);
    });
    if (secretlintCandidates.length === 0)
        return 0;
    const stageRoot = mkdtempSync(join(tmpdir(), 'wp-package-surface-pack-'));
    try {
        stagePackedFiles(root, stageRoot, candidate, secretlintCandidates);
        const secretlintOutput = runSecretlint(stageRoot, candidate.packageRoot);
        let checked = secretlintCandidates.length;
        for (const message of normalizeSecretlintMessages(secretlintOutput)) {
            const absoluteFilePath = message.filePath
                ? resolveSecretlintFilePath(stageRoot, message.filePath)
                : undefined;
            const relativeToStage = absoluteFilePath
                ? relativePath(stageRoot, absoluteFilePath)
                : undefined;
            const repoRelative = relativeToStage
                ? packageRelativeRoot
                    ? `${packageRelativeRoot}/${relativeToStage}`
                    : relativeToStage
                : relativePath(root, candidate.packageFile);
            const packedPath = relativeToStage ?? repoRelative;
            if (matchesAny(allowedPathRules, packedPath, repoRelative))
                continue;
            if (message.messageId && allowedMessageIds.has(message.messageId))
                continue;
            const location = message.line && message.column
                ? `:${message.line}:${message.column}`
                : message.line
                    ? `:${message.line}`
                    : '';
            violations.push({
                file: repoRelative,
                message: `Secretlint flagged packed file${location}: ${message.ruleId ?? 'secretlint'}${message.messageId ? `/${message.messageId}` : ''} — ${message.message ?? 'secret detected'}`,
            });
        }
        return checked;
    }
    finally {
        rmSync(stageRoot, { recursive: true, force: true });
    }
}
function discoverPublishablePackages(root) {
    const packages = [];
    for (const packageFile of walkFiles(root, (file) => basename(file) === 'package.json')) {
        const pkg = readJsonObject(packageFile);
        if (!pkg.name?.startsWith('@webpresso/') && pkg.name !== 'webpresso')
            continue;
        if (pkg.private === true)
            continue;
        packages.push({
            name: pkg.name,
            packageFile,
            packageRoot: dirname(packageFile),
        });
    }
    return packages;
}
function readPackedEntry(packageRoot) {
    const raw = execFileSync('npm', ['pack', '--dry-run', '--json'], {
        cwd: packageRoot,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    const entries = JSON.parse(raw);
    if (!Array.isArray(entries) || entries.length === 0)
        return {};
    return entries[0] ?? {};
}
function stagePackedFiles(root, destinationRoot, candidate, packedFiles) {
    const packageRelativeRoot = relativePath(root, candidate.packageRoot);
    for (const packedFile of packedFiles) {
        const source = join(candidate.packageRoot, packedFile.path);
        if (!existsSync(source))
            continue;
        const destination = join(destinationRoot, packageRelativeRoot, packedFile.path);
        mkdirSync(dirname(destination), { recursive: true });
        copyFileSync(source, destination);
    }
}
function runSecretlint(stageRoot, packageRoot) {
    const rcPath = findSecretlintRc(packageRoot);
    const outputFile = join(stageRoot, '.secretlint-output.json');
    const toolRoot = findSecretlintToolRoot(packageRoot) ?? findSecretlintToolRoot(process.cwd());
    const args = ['exec', 'secretlint', '--format', 'json', '--output', outputFile, '--no-gitignore'];
    if (rcPath) {
        args.push('--secretlintrc', rcPath);
    }
    else {
        args.push('--secretlintrcJSON', SECRETLINT_DEFAULT_CONFIG);
    }
    args.push(join(stageRoot, '**/*'));
    try {
        execFileSync('pnpm', args, {
            cwd: toolRoot ?? packageRoot,
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            maxBuffer: 20 * 1024 * 1024,
        });
        const stdout = readText(outputFile) ?? '';
        return stdout.trim() ? JSON.parse(stdout) : [];
    }
    catch (error) {
        const output = readText(outputFile) ?? '';
        if (output.trim())
            return JSON.parse(output);
        throw error;
    }
    finally {
        rmSync(outputFile, { force: true });
    }
}
function findSecretlintToolRoot(start) {
    let current = resolve(start);
    while (true) {
        if (existsSync(join(current, 'node_modules', '.bin', 'secretlint')))
            return current;
        const parent = dirname(current);
        if (parent === current)
            return undefined;
        current = parent;
    }
}
function findSecretlintRc(root) {
    const candidates = [
        '.secretlintrc.json',
        '.secretlintrc.json5',
        '.secretlintrc.yaml',
        '.secretlintrc.yml',
        '.secretlintrc.js',
        '.secretlintrc.cjs',
        '.secretlintrc.mjs',
    ].map((name) => join(root, name));
    return candidates.find((candidate) => existsSync(candidate));
}
function normalizeSecretlintMessages(output) {
    if (!Array.isArray(output))
        return [];
    const messages = [];
    for (const entry of output) {
        if (!entry || typeof entry !== 'object')
            continue;
        const filePath = 'filePath' in entry && typeof entry.filePath === 'string' ? entry.filePath : undefined;
        const nestedMessages = 'messages' in entry && Array.isArray(entry.messages) ? entry.messages : [];
        for (const nested of nestedMessages) {
            if (!nested || typeof nested !== 'object')
                continue;
            messages.push({
                filePath,
                message: typeof nested.message === 'string' ? nested.message : undefined,
                ruleId: typeof nested.ruleId === 'string' ? nested.ruleId : undefined,
                messageId: typeof nested.messageId === 'string' ? nested.messageId : undefined,
                line: nested.loc &&
                    typeof nested.loc === 'object' &&
                    'start' in nested.loc &&
                    nested.loc.start &&
                    typeof nested.loc.start === 'object' &&
                    'line' in nested.loc.start &&
                    typeof nested.loc.start.line === 'number'
                    ? nested.loc.start.line
                    : typeof nested.line === 'number'
                        ? nested.line
                        : undefined,
                column: nested.loc &&
                    typeof nested.loc === 'object' &&
                    'start' in nested.loc &&
                    nested.loc.start &&
                    typeof nested.loc.start === 'object' &&
                    'column' in nested.loc.start &&
                    typeof nested.loc.start.column === 'number'
                    ? nested.loc.start.column
                    : typeof nested.column === 'number'
                        ? nested.column
                        : undefined,
            });
        }
    }
    return messages;
}
function resolveSecretlintFilePath(stageRoot, filePath) {
    return filePath.startsWith(stageRoot) ? filePath : resolve(stageRoot, filePath);
}
function isExcludedFromDeepScan(packedPath, repoRelativePath, pathPrefixes) {
    const normalizedPackedPath = normalizePackedPath(packedPath);
    const normalizedRepoRelative = normalizePackedPath(repoRelativePath);
    return pathPrefixes.some((prefix) => {
        const normalizedPrefix = normalizePackedPrefix(prefix);
        return (normalizedPackedPath === normalizedPrefix.slice(0, -1) ||
            normalizedPackedPath.startsWith(normalizedPrefix) ||
            normalizedRepoRelative === normalizedPrefix.slice(0, -1) ||
            normalizedRepoRelative.startsWith(normalizedPrefix));
    });
}
function normalizePackedPath(value) {
    return value.replace(/\\/g, '/').replace(/^\.?\//, '');
}
function normalizePackedPrefix(value) {
    const normalized = normalizePackedPath(value);
    return normalized.endsWith('/') ? normalized : `${normalized}/`;
}
function auditReferenceConsumerFreshness(root, baselines, violations) {
    const workspaceFile = join(root, 'pnpm-workspace.yaml');
    const lockfile = join(root, 'pnpm-lock.yaml');
    if (!existsSync(workspaceFile) && !existsSync(lockfile))
        return 0;
    const workspaceText = readText(workspaceFile) ?? '';
    const lockText = readText(lockfile) ?? '';
    let checked = 0;
    for (const [packageName, minimumVersion] of Object.entries(baselines)) {
        const declaredRange = findCatalogRange(workspaceText, packageName);
        const resolvedVersion = findLockVersion(lockText, packageName);
        if (!declaredRange && !resolvedVersion)
            continue;
        checked += 1;
        if (resolvedVersion && compareVersions(resolvedVersion, minimumVersion) < 0) {
            violations.push({
                file: 'pnpm-lock.yaml',
                message: `${packageName} resolves to ${resolvedVersion}; expected at least ${minimumVersion}`,
            });
            continue;
        }
        if (!resolvedVersion && declaredRange && declaredRange !== 'catalog:') {
            const declaredVersion = declaredRange.replace(/^[~^]/, '');
            if (compareVersions(declaredVersion, minimumVersion) < 0) {
                violations.push({
                    file: 'pnpm-workspace.yaml',
                    message: `${packageName} catalog range ${declaredRange} is older than baseline ${minimumVersion}`,
                });
            }
        }
    }
    return checked;
}
function findCatalogRange(workspaceText, packageName) {
    const escapedName = escapeRegExp(packageName);
    const match = new RegExp(`["']?${escapedName}["']?\\s*:\\s*([^\\s#]+)`).exec(workspaceText);
    return match?.[1]?.replace(/^['"]|['"]$/g, '');
}
function findLockVersion(lockText, packageName) {
    const escapedName = escapeRegExp(packageName);
    const match = new RegExp(`(?:^|[\\n\\s'"])${escapedName}@(\\d+\\.\\d+\\.\\d+(?:[-+][^'":\\s]+)?)(?=['":\\s]|$)`, 'm').exec(lockText);
    return match?.[1];
}
function compareVersions(left, right) {
    const leftParts = parseVersion(left);
    const rightParts = parseVersion(right);
    for (let index = 0; index < 3; index += 1) {
        const delta = (leftParts[index] ?? 0) - (rightParts[index] ?? 0);
        if (delta !== 0)
            return delta;
    }
    return 0;
}
function parseVersion(version) {
    const match = /^(\d+)\.(\d+)\.(\d+)/.exec(version);
    return [Number(match?.[1] ?? 0), Number(match?.[2] ?? 0), Number(match?.[3] ?? 0)];
}
function walkFiles(root, predicate, baseRoot = root) {
    if (root !== baseRoot && existsSync(join(root, '.git')))
        return [];
    const files = [];
    for (const entry of readdirSync(root, { withFileTypes: true })) {
        if (SKIP_DIRECTORIES.has(entry.name))
            continue;
        const file = join(root, entry.name);
        if (entry.isDirectory()) {
            files.push(...walkFiles(file, predicate, baseRoot));
            continue;
        }
        if (entry.isFile() && predicate(file))
            files.push(file);
    }
    return files.toSorted((left, right) => left.localeCompare(right));
}
function isScannablePublicFile(file) {
    if (IGNORED_SCAN_BASENAMES.has(basename(file)))
        return false;
    return SCANNED_EXTENSIONS.has(fileExtension(file));
}
function fileExtension(file) {
    const name = basename(file);
    const dot = name.lastIndexOf('.');
    return dot === -1 ? '' : name.slice(dot);
}
function isSecretlintCandidate(file) {
    return SECRETLINT_EXTENSIONS.has(fileExtension(file));
}
function packageFileToRepoRelative(root, candidate, packedPath) {
    const packageRelativeRoot = relativePath(root, candidate.packageRoot);
    return packageRelativeRoot ? `${packageRelativeRoot}/${packedPath}` : packedPath;
}
function readPackedText(file) {
    try {
        const buffer = readFileSync(file);
        if (buffer.includes(0))
            return undefined;
        return buffer.toString('utf8');
    }
    catch {
        return undefined;
    }
}
function compileMatchRules(patterns) {
    return patterns.map((raw) => {
        const parsed = parseSlashRegex(raw);
        return parsed
            ? { raw, matches: (value) => parsed.test(value) }
            : { raw, matches: (value) => value.includes(raw) };
    });
}
function matchesAny(rules, ...values) {
    return rules.some((rule) => values.some((value) => rule.matches(value)));
}
function parseSlashRegex(pattern) {
    if (!pattern.startsWith('/'))
        return undefined;
    const lastSlash = pattern.lastIndexOf('/');
    if (lastSlash <= 0)
        return undefined;
    const source = pattern.slice(1, lastSlash);
    const flags = pattern.slice(lastSlash + 1);
    try {
        return new RegExp(source, flags);
    }
    catch {
        return undefined;
    }
}
function hasActionableForbiddenMention(text, pattern) {
    for (const line of text.split(/\r?\n/)) {
        if (!line.includes(pattern))
            continue;
        const lower = line.toLowerCase();
        if (lower.includes(`no ${pattern.toLowerCase()}`))
            continue;
        if (lower.includes('must not') ||
            lower.includes('never appears') ||
            lower.includes('forbidden'))
            continue;
        return true;
    }
    return false;
}
function readJsonObject(file) {
    try {
        const value = JSON.parse(readFileSync(file, 'utf8'));
        if (!value || typeof value !== 'object' || Array.isArray(value))
            return {};
        return value;
    }
    catch {
        return {};
    }
}
function readText(file) {
    try {
        return readFileSync(file, 'utf8');
    }
    catch {
        return undefined;
    }
}
function relativePath(root, file) {
    return relative(root, file).split('\\').join('/');
}
function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
function errorMessage(error) {
    if (error instanceof Error)
        return error.message;
    return String(error);
}
//# sourceMappingURL=package-surface.js.map