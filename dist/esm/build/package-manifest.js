import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync, writeFileSync, } from 'node:fs';
import { dirname, join } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { assertBuiltBlueprintMigrationSqlAssets } from './blueprint-migration-assets.js';
import { RUNTIME_TARGETS } from './runtime-targets.js';
const DEPENDENCY_SECTIONS = [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
];
const NON_PUBLISHABLE_DEPENDENCY_PROTOCOLS = ['link:', 'workspace:', 'file:'];
const BACKUP_FILENAME = '.package.json.prepack.backup';
const DIST_BACKUP_DIRNAME = '.dist-prepack-backup';
const SOURCEMAP_COMMENT_BACKUP_DIRNAME = '.sourcemap-comments-prepack-backup';
const SOURCEMAP_COMMENT_PATTERN = /^\s*\/\/# sourceMappingURL=.*(?:\r?\n|$)/gmu;
function asStringMap(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value))
        return undefined;
    const entries = Object.entries(value).filter((entry) => typeof entry[1] === 'string');
    return Object.fromEntries(entries);
}
function normalizePackedBinPath(value) {
    return value.startsWith('./') ? value.slice(2) : value;
}
function normalizePackedBinField(value) {
    if (typeof value === 'string') {
        return normalizePackedBinPath(value);
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        return value;
    }
    return Object.fromEntries(Object.entries(value).map(([name, path]) => [
        name,
        typeof path === 'string' ? normalizePackedBinPath(path) : path,
    ]));
}
export function readWorkspaceCatalogs(workspacePath) {
    const parsed = parseYaml(readFileSync(workspacePath, 'utf8'));
    const catalogs = asStringMap(parsed.catalog);
    const namedCatalogs = parsed.catalogs && typeof parsed.catalogs === 'object' && !Array.isArray(parsed.catalogs)
        ? Object.fromEntries(Object.entries(parsed.catalogs)
            .map(([name, value]) => [name, asStringMap(value)])
            .filter((entry) => entry[1] !== undefined))
        : undefined;
    const workspacePackages = readWorkspacePackageVersions(dirname(workspacePath), parsed.packages);
    return {
        catalog: catalogs,
        catalogs: namedCatalogs,
        workspacePackages,
    };
}
function readWorkspacePackageVersions(repoRoot, packageGlobs) {
    if (!Array.isArray(packageGlobs))
        return undefined;
    const versions = {};
    for (const pattern of packageGlobs) {
        if (typeof pattern !== 'string')
            continue;
        if (pattern.includes('!'))
            continue;
        if (pattern.endsWith('/*')) {
            const parentDir = join(repoRoot, pattern.slice(0, -2));
            if (!existsSync(parentDir))
                continue;
            for (const child of readdirSync(parentDir)) {
                collectWorkspacePackageVersion(join(parentDir, child), versions);
            }
            continue;
        }
        collectWorkspacePackageVersion(join(repoRoot, pattern), versions);
    }
    return Object.keys(versions).length > 0 ? versions : undefined;
}
function collectWorkspacePackageVersion(dirPath, versions) {
    const packageJsonPath = join(dirPath, 'package.json');
    if (!existsSync(packageJsonPath))
        return;
    const parsed = JSON.parse(readFileSync(packageJsonPath, 'utf8'));
    if (typeof parsed.name !== 'string' || typeof parsed.version !== 'string')
        return;
    versions[parsed.name] = parsed.version;
}
export function resolveCatalogSpecifier(dependencyName, version, workspaceCatalogs) {
    if (version.startsWith('workspace:')) {
        const localVersion = workspaceCatalogs.workspacePackages?.[dependencyName];
        if (!localVersion)
            return version;
        const workspaceRange = version.slice('workspace:'.length);
        if (workspaceRange === '*' || workspaceRange.length === 0)
            return localVersion;
        if (workspaceRange === '^' || workspaceRange === '~')
            return `${workspaceRange}${localVersion}`;
        return workspaceRange;
    }
    if (!version.startsWith('catalog:'))
        return version;
    const catalogName = version.slice('catalog:'.length);
    if (catalogName.length === 0) {
        const resolved = workspaceCatalogs.catalog?.[dependencyName];
        if (!resolved) {
            throw new Error(`Missing pnpm catalog entry for ${dependencyName}`);
        }
        return resolved;
    }
    const resolved = workspaceCatalogs.catalogs?.[catalogName]?.[dependencyName];
    if (!resolved) {
        throw new Error(`Missing pnpm named catalog "${catalogName}" entry for ${dependencyName}`);
    }
    return resolved;
}
function assertPublishableDependencySpecifier(section, dependencyName, version) {
    const blockedProtocol = NON_PUBLISHABLE_DEPENDENCY_PROTOCOLS.find((protocol) => version.startsWith(protocol));
    if (!blockedProtocol)
        return;
    throw new Error(`Cannot pack ${section}.${dependencyName} with non-publishable ${blockedProtocol} specifier ${JSON.stringify(version)}`);
}
export function createPackedManifest(manifest, workspaceCatalogs) {
    const packedManifest = { ...manifest };
    for (const section of DEPENDENCY_SECTIONS) {
        const dependencies = manifest[section];
        if (!dependencies)
            continue;
        if (section === 'devDependencies') {
            // Validate devDependencies but strip them from the packed manifest.
            // npm validates all specifiers even with --omit=dev, so workspace: specifiers
            // from monorepo self-hosting would cause npm to reject the tarball. file: and
            // link: still throw — they are local paths that indicate a configuration mistake.
            for (const [dependencyName, version] of Object.entries(dependencies)) {
                const resolvedVersion = resolveCatalogSpecifier(dependencyName, version, workspaceCatalogs);
                if (!resolvedVersion.startsWith('workspace:')) {
                    assertPublishableDependencySpecifier(section, dependencyName, resolvedVersion);
                }
            }
            delete packedManifest.devDependencies;
            continue;
        }
        packedManifest[section] = Object.fromEntries(Object.entries(dependencies).map(([dependencyName, version]) => {
            const resolvedVersion = resolveCatalogSpecifier(dependencyName, version, workspaceCatalogs);
            assertPublishableDependencySpecifier(section, dependencyName, resolvedVersion);
            return [dependencyName, resolvedVersion];
        }));
    }
    if ('bin' in packedManifest) {
        packedManifest.bin = normalizePackedBinField(packedManifest.bin);
    }
    // Published tarballs should not require repo-local authoring tools at
    // install time. Keep devDependency validation above (so obviously broken
    // local protocols still fail loudly while authoring), but strip the
    // devDependencies section from the packed manifest entirely.
    delete packedManifest.devDependencies;
    if (typeof manifest.version === 'string') {
        packedManifest.optionalDependencies = {
            ...packedManifest.optionalDependencies,
            ...Object.fromEntries(RUNTIME_TARGETS.map((target) => [target.packageName, manifest.version])),
        };
    }
    return packedManifest;
}
function writeJson(filePath, value) {
    const next = `${JSON.stringify(value, null, 2)}\n`;
    const tmp = `${filePath}.tmp`;
    writeFileSync(tmp, next, 'utf8');
    renameSync(tmp, filePath);
}
function writeText(filePath, value) {
    const tmp = `${filePath}.tmp`;
    writeFileSync(tmp, value, 'utf8');
    renameSync(tmp, filePath);
}
function pruneOrphanedDistSubtrees(rootDir) {
    const distRoot = join(rootDir, 'dist', 'esm');
    const srcRoot = join(rootDir, 'src');
    if (!existsSync(distRoot) || !existsSync(srcRoot))
        return;
    const backupRoot = join(rootDir, DIST_BACKUP_DIRNAME);
    let pruned = false;
    for (const entry of readdirSync(distRoot, { withFileTypes: true })) {
        if (!entry.isDirectory())
            continue;
        const distDir = join(distRoot, entry.name);
        const srcDir = join(srcRoot, entry.name);
        if (existsSync(srcDir))
            continue;
        if (!existsSync(backupRoot))
            mkdirSync(backupRoot, { recursive: true });
        pruned = true;
        const backupTarget = join(backupRoot, entry.name);
        renameSync(distDir, backupTarget);
    }
    if (!pruned && existsSync(backupRoot)) {
        rmSync(backupRoot, { force: true, recursive: true });
    }
}
function restorePrunedDistSubtrees(rootDir) {
    const backupRoot = join(rootDir, DIST_BACKUP_DIRNAME);
    const distRoot = join(rootDir, 'dist', 'esm');
    if (!existsSync(backupRoot))
        return;
    for (const entry of readdirSync(backupRoot, { withFileTypes: true })) {
        const backupPath = join(backupRoot, entry.name);
        const restorePath = join(distRoot, entry.name);
        if (existsSync(restorePath)) {
            rmSync(restorePath, { force: true, recursive: true });
        }
        renameSync(backupPath, restorePath);
    }
    rmSync(backupRoot, { force: true, recursive: true });
}
function listBuiltTextFiles(rootDir) {
    const distRoot = join(rootDir, 'dist', 'esm');
    if (!existsSync(distRoot))
        return [];
    const files = [];
    const visit = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const entryPath = join(dir, entry.name);
            if (entry.isDirectory()) {
                visit(entryPath);
            }
            else if (entry.name.endsWith('.js') || entry.name.endsWith('.d.ts')) {
                files.push(entryPath);
            }
        }
    };
    visit(distRoot);
    return files.sort();
}
function relativeDistPath(rootDir, filePath) {
    const distRoot = join(rootDir, 'dist', 'esm');
    return filePath.slice(distRoot.length + 1);
}
function stripPackedSourcemapComments(rootDir) {
    const backupDir = join(rootDir, SOURCEMAP_COMMENT_BACKUP_DIRNAME);
    if (existsSync(backupDir)) {
        throw new Error(`Source map comment prepack backup already exists at ${backupDir}`);
    }
    let stripped = false;
    for (const filePath of listBuiltTextFiles(rootDir)) {
        const existing = readFileSync(filePath, 'utf8');
        const next = existing.replace(SOURCEMAP_COMMENT_PATTERN, '');
        if (next === existing)
            continue;
        const backupPath = join(backupDir, relativeDistPath(rootDir, filePath));
        mkdirSync(dirname(backupPath), { recursive: true });
        writeText(backupPath, existing);
        writeText(filePath, next);
        stripped = true;
    }
    if (!stripped && existsSync(backupDir)) {
        rmSync(backupDir, { force: true, recursive: true });
    }
}
function restorePackedSourcemapComments(rootDir) {
    const backupDir = join(rootDir, SOURCEMAP_COMMENT_BACKUP_DIRNAME);
    if (!existsSync(backupDir))
        return;
    const restore = (dir) => {
        for (const entry of readdirSync(dir, { withFileTypes: true })) {
            const entryPath = join(dir, entry.name);
            if (entry.isDirectory()) {
                restore(entryPath);
                continue;
            }
            const targetPath = join(rootDir, 'dist', 'esm', entryPath.slice(backupDir.length + 1));
            mkdirSync(dirname(targetPath), { recursive: true });
            writeText(targetPath, readFileSync(entryPath, 'utf8'));
        }
    };
    restore(backupDir);
    rmSync(backupDir, { force: true, recursive: true });
}
export function preparePackedManifest(rootDir) {
    const packageJsonPath = join(rootDir, 'package.json');
    const workspacePath = join(rootDir, 'pnpm-workspace.yaml');
    const backupPath = join(rootDir, BACKUP_FILENAME);
    if (existsSync(backupPath)) {
        throw new Error(`Packed-manifest backup already exists at ${backupPath}`);
    }
    const originalManifestText = readFileSync(packageJsonPath, 'utf8');
    const manifest = JSON.parse(originalManifestText);
    const packedManifest = createPackedManifest(manifest, readWorkspaceCatalogs(workspacePath));
    assertBuiltBlueprintMigrationSqlAssets(rootDir);
    writeText(backupPath, originalManifestText);
    pruneOrphanedDistSubtrees(rootDir);
    stripPackedSourcemapComments(rootDir);
    writeJson(packageJsonPath, packedManifest);
}
export function restorePackedManifest(rootDir) {
    const packageJsonPath = join(rootDir, 'package.json');
    const backupPath = join(rootDir, BACKUP_FILENAME);
    if (!existsSync(backupPath))
        return;
    writeText(packageJsonPath, readFileSync(backupPath, 'utf8'));
    rmSync(backupPath, { force: true });
    restorePackedSourcemapComments(rootDir);
    restorePrunedDistSubtrees(rootDir);
}
if (import.meta.main) {
    const command = process.argv[2];
    const rootDir = process.cwd();
    if (command === 'prepare') {
        preparePackedManifest(rootDir);
    }
    else if (command === 'restore') {
        restorePackedManifest(rootDir);
    }
    else {
        throw new Error('Usage: bun src/build/package-manifest.ts <prepare|restore>');
    }
}
//# sourceMappingURL=package-manifest.js.map