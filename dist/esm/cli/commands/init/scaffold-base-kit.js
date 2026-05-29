import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { writeFileMerged } from './merge.js';
const AUTHORING_TIME_DEPENDENCIES = [
    'vitest',
    '@playwright/test',
    '@testing-library/jest-dom',
    'typescript',
];
const EXECUTION_ONLY_REVIEW_DEPENDENCIES = [
    'oxlint',
    'oxfmt',
    'prettier',
    'markdownlint-cli2',
    'stryker',
];
export function collectRuntimeContractGuidance(packageJson) {
    const deps = {
        ...readDependencyBucket(packageJson?.['dependencies']),
        ...readDependencyBucket(packageJson?.['devDependencies']),
    };
    const installed = new Set(Object.keys(deps));
    return {
        keepLocalAuthoringDeps: AUTHORING_TIME_DEPENDENCIES.filter((name) => installed.has(name)),
        reviewForRemovalDeps: EXECUTION_ONLY_REVIEW_DEPENDENCIES.filter((name) => installed.has(name)),
    };
}
/** Template files relative to `catalog/base-kit/`, and their target paths relative to repoRoot. */
const TEMPLATE_MAP = [
    ['.editorconfig.tmpl', '.editorconfig'],
    ['.secretlintrc.json.tmpl', '.secretlintrc.json'],
    ['.actrc.tmpl', '.actrc'],
    ['commitlint.config.ts.tmpl', 'commitlint.config.ts'],
    ['scripts/check-no-dev-vars.ts.tmpl', 'scripts/check-no-dev-vars.ts'],
    [
        'scripts/audit-secret-provider-quarantine.ts.tmpl',
        'scripts/audit-secret-provider-quarantine.ts',
    ],
    ['.husky/pre-commit.tmpl', '.husky/pre-commit'],
    ['.husky/commit-msg.tmpl', '.husky/commit-msg'],
    ['.github/workflows/ci.webpresso.yml.tmpl', '.github/workflows/ci.webpresso.yml'],
    ['test/.gitkeep.tmpl', 'test/.gitkeep'],
    ['e2e/.gitkeep.tmpl', 'e2e/.gitkeep'],
];
/** Consumer-owned quality scaffold: create for fresh repos, never clobber. */
const QUALITY_BOOTSTRAP_ONLY_MAP = [
    ['tsconfig.json.tmpl', 'tsconfig.json'],
    ['vitest.config.ts.tmpl', 'vitest.config.ts'],
    ['oxlint.config.ts.tmpl', 'oxlint.config.ts'],
    ['stryker.config.ts.tmpl', 'stryker.config.ts'],
    ['playwright.config.ts.tmpl', 'playwright.config.ts'],
    ['src/quality-sample.ts.tmpl', 'src/quality-sample.ts'],
    ['src/quality-sample.test.ts.tmpl', 'src/quality-sample.test.ts'],
    ['e2e/fixtures/smoke.html.tmpl', 'e2e/fixtures/smoke.html'],
    ['e2e/smoke.spec.ts.tmpl', 'e2e/smoke.spec.ts'],
];
export const BASE_KIT_QUALITY_TARGETS = QUALITY_BOOTSTRAP_ONLY_MAP.map(([, targetRel]) => targetRel);
/**
 * Bootstrap-only templates: the scaffolder writes them when absent (so a
 * fresh repo gets sane defaults) but NEVER overwrites them once they exist
 * — even under `--overwrite`. These files are consumer-owned and grow with
 * project-specific content (catalog entries, ignore patterns) that the
 * generic template can't reproduce. Clobbering them on every `wp setup`
 * deletes that content silently, breaks `vp install`, and pollutes git
 * status with thousands of newly-tracked artifacts.
 *
 * Verified failure mode (large multi-package workspace, 2026-05-07): the postinstall
 * `wp setup --overwrite` reduced pnpm-workspace.yaml from 221 lines (full
 * catalog) to 34 lines (generic template), removing catalog entries
 * referenced by `pnpm.overrides` and
 * making subsequent `vp install` fail with ERR_PNPM_CATALOG_IN_OVERRIDES.
 * The same overwrite stripped workspace-specific .gitignore rules
 * (.test-reports/, generated outputs, worker-state directories, etc.),
 * unmasking 23k+ generated artifacts to git status.
 */
const BOOTSTRAP_ONLY_MAP = [
    ['.gitignore.tmpl', '.gitignore'],
    ['pnpm-workspace.yaml.tmpl', 'pnpm-workspace.yaml'],
];
/** Merge `engines` and `packageManager` into the consumer repo's package.json. */
function mergePackageJson(repoRoot, options, globalInstall = false) {
    const pkgPath = join(repoRoot, 'package.json');
    const engines = { node: '>=24' };
    const packageManager = 'pnpm@11.1.1';
    if (options.dryRun) {
        return { targetPath: pkgPath, action: 'skipped-dry' };
    }
    let pkg = {};
    if (existsSync(pkgPath)) {
        try {
            pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
        }
        catch {
            // malformed — leave untouched
            return { targetPath: pkgPath, action: 'identical' };
        }
    }
    else {
        pkg = { name: 'my-app', version: '0.0.0', private: true, type: 'module' };
    }
    const existing = pkg['engines'];
    const alreadyHasEngines = existing?.node === engines.node;
    // Don't downgrade: treat any pnpm@11+ as already-satisfied so wp setup
    // does not regress repos that have already been migrated to v11.
    const existingPm = pkg['packageManager'];
    const alreadyHasPm = existingPm === packageManager ||
        (typeof existingPm === 'string' && /^pnpm@1[1-9]\./.test(existingPm));
    const packageName = typeof pkg['name'] === 'string' ? pkg['name'] : undefined;
    const scripts = (pkg['scripts'] ?? {});
    const hasSetupAgent = typeof scripts['setup:agent'] === 'string';
    const hasVerifyPaths = typeof scripts['verify:paths'] === 'string';
    const hasVerifySecrets = typeof scripts['verify:secrets'] === 'string';
    const hasSecretQuarantineAudit = typeof scripts['audit:secret-provider-quarantine'] === 'string';
    const hasPrepareScript = typeof scripts['prepare'] === 'string';
    const hasLintScript = typeof scripts['lint'] === 'string';
    const hasTypecheckScript = typeof scripts['typecheck'] === 'string';
    const hasTestScript = typeof scripts['test'] === 'string' && !isNpmInitPlaceholderTestScript(scripts['test']);
    const hasMutationScript = typeof scripts['mutation'] === 'string';
    const hasTestMutationScript = typeof scripts['test:mutation'] === 'string';
    const hasE2eScript = typeof scripts['e2e'] === 'string';
    const hasQaScript = typeof scripts['qa'] === 'string';
    const verifyPathsScript = 'WP_SKIP_UPDATE_CHECK=1 wp audit absolute-path-policy --root .';
    const verifySecretsScript = 'bun scripts/check-no-dev-vars.ts';
    const secretQuarantineAuditScript = 'bun scripts/audit-secret-provider-quarantine.ts';
    const lintScript = 'wp lint src e2e *.config.ts';
    const typecheckScript = 'wp typecheck';
    const testScript = 'wp test --file vitest.config.ts';
    const mutationScript = 'wp test --mutation';
    const testMutationScript = 'stryker run stryker.config.ts';
    const e2eScript = 'wp e2e --config playwright.config.ts';
    const qaScript = [
        'wp lint src e2e *.config.ts',
        'wp typecheck',
        'wp test --file vitest.config.ts',
        'wp test --mutation',
        'wp e2e --config playwright.config.ts',
    ].join(' && ');
    const devDeps = (pkg['devDependencies'] ?? {});
    const hasAgentKitDevDep = typeof devDeps['@webpresso/agent-kit'] === 'string';
    const hasLegacyAgentKitDevDep = typeof devDeps['webpresso'] === 'string';
    const shouldSkipSelfInstall = packageName === '@webpresso/agent-kit' || packageName === 'webpresso';
    const shouldManageAgentKitAsGlobal = globalInstall && !shouldSkipSelfInstall;
    const requiredAuthoringDeps = {
        '@playwright/test': 'latest',
        '@stryker-mutator/core': 'latest',
        '@stryker-mutator/vitest-runner': 'latest',
        '@types/node': 'latest',
        typescript: 'latest',
        vitest: 'latest',
    };
    if (alreadyHasEngines &&
        alreadyHasPm &&
        (shouldSkipSelfInstall ||
            shouldManageAgentKitAsGlobal ||
            hasAgentKitDevDep ||
            hasLegacyAgentKitDevDep) &&
        Object.keys(requiredAuthoringDeps).every((name) => typeof devDeps[name] === 'string') &&
        (shouldSkipSelfInstall || hasSetupAgent) &&
        (shouldSkipSelfInstall || hasVerifyPaths) &&
        (shouldSkipSelfInstall || hasVerifySecrets) &&
        (shouldSkipSelfInstall || hasSecretQuarantineAudit) &&
        (shouldSkipSelfInstall || hasPrepareScript) &&
        hasLintScript &&
        hasTypecheckScript &&
        hasTestScript &&
        hasMutationScript &&
        hasTestMutationScript &&
        hasE2eScript &&
        hasQaScript) {
        return { targetPath: pkgPath, action: 'identical' };
    }
    pkg['engines'] = { ...existing, node: engines.node };
    if (!alreadyHasPm)
        pkg['packageManager'] = packageManager;
    if (typeof pkg['type'] !== 'string')
        pkg['type'] = 'module';
    // Ensure husky is in devDependencies so `vp exec husky init` works
    if (!devDeps['husky']) {
        devDeps['husky'] = '^9.0.0';
    }
    if (!shouldSkipSelfInstall &&
        !shouldManageAgentKitAsGlobal &&
        !hasAgentKitDevDep &&
        !hasLegacyAgentKitDevDep) {
        // Keep consumers on the currently published dist-tag rather than a
        // repo-internal path. Do not wire this through `prepare`: `wp` is not
        // reliably on PATH during `vp install`, so `setup:agent` stays opt-in.
        devDeps['@webpresso/agent-kit'] = 'latest';
    }
    for (const [name, version] of Object.entries(requiredAuthoringDeps)) {
        if (!devDeps[name]) {
            devDeps[name] = version;
        }
    }
    pkg['devDependencies'] = devDeps;
    if (!shouldSkipSelfInstall && !hasSetupAgent) {
        scripts['setup:agent'] = 'wp setup';
    }
    if (!shouldSkipSelfInstall && !hasVerifyPaths) {
        scripts['verify:paths'] = verifyPathsScript;
    }
    if (!shouldSkipSelfInstall && !hasVerifySecrets) {
        scripts['verify:secrets'] = verifySecretsScript;
    }
    if (!shouldSkipSelfInstall && !hasSecretQuarantineAudit) {
        scripts['audit:secret-provider-quarantine'] = secretQuarantineAuditScript;
    }
    if (!shouldSkipSelfInstall && !hasPrepareScript) {
        scripts['prepare'] = 'husky';
    }
    if (!hasLintScript) {
        scripts['lint'] = lintScript;
    }
    if (!hasTypecheckScript) {
        scripts['typecheck'] = typecheckScript;
    }
    if (!hasTestScript) {
        scripts['test'] = testScript;
    }
    if (!hasMutationScript) {
        scripts['mutation'] = mutationScript;
    }
    if (!hasTestMutationScript) {
        scripts['test:mutation'] = testMutationScript;
    }
    if (!hasE2eScript) {
        scripts['e2e'] = e2eScript;
    }
    if (!hasQaScript) {
        scripts['qa'] = qaScript;
    }
    if (Object.keys(scripts).length > 0) {
        pkg['scripts'] = scripts;
    }
    mkdirSync(dirname(pkgPath), { recursive: true });
    writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
    return { targetPath: pkgPath, action: 'overwritten' };
}
export function scaffoldBaseKit(input) {
    const { catalogDir, repoRoot, options, globalInstall = false } = input;
    const baseKitDir = join(catalogDir, 'base-kit');
    const results = [];
    for (const [tmplRel, targetRel] of TEMPLATE_MAP) {
        const tmplPath = join(baseKitDir, tmplRel);
        if (!existsSync(tmplPath))
            continue;
        const content = readFileSync(tmplPath, 'utf8');
        const targetPath = join(repoRoot, targetRel);
        results.push(writeFileMerged(targetPath, content, options));
    }
    // Bootstrap-only: write template only when target is absent. Never
    // overwrite (even under --overwrite): the consumer's existing file is the
    // source of truth once it exists.
    for (const [tmplRel, targetRel] of BOOTSTRAP_ONLY_MAP) {
        const tmplPath = join(baseKitDir, tmplRel);
        if (!existsSync(tmplPath))
            continue;
        const targetPath = join(repoRoot, targetRel);
        if (existsSync(targetPath)) {
            results.push({ targetPath, action: 'identical' });
            continue;
        }
        const content = readFileSync(tmplPath, 'utf8');
        if (options.dryRun) {
            results.push({ targetPath, action: 'skipped-dry' });
            continue;
        }
        mkdirSync(dirname(targetPath), { recursive: true });
        writeFileSync(targetPath, content);
        results.push({ targetPath, action: 'created' });
    }
    for (const [tmplRel, targetRel] of QUALITY_BOOTSTRAP_ONLY_MAP) {
        const tmplPath = join(baseKitDir, tmplRel);
        if (!existsSync(tmplPath))
            continue;
        const targetPath = join(repoRoot, targetRel);
        if (existsSync(targetPath)) {
            results.push({ targetPath, action: 'identical' });
            continue;
        }
        const content = readFileSync(tmplPath, 'utf8');
        if (options.dryRun) {
            results.push({ targetPath, action: 'skipped-dry' });
            continue;
        }
        mkdirSync(dirname(targetPath), { recursive: true });
        writeFileSync(targetPath, content);
        results.push({ targetPath, action: 'created' });
    }
    // Make husky hook files executable
    if (!options.dryRun) {
        for (const [tmplRel, targetRel] of TEMPLATE_MAP) {
            if (tmplRel.startsWith('.husky/')) {
                const targetPath = join(repoRoot, targetRel);
                if (existsSync(targetPath)) {
                    try {
                        chmodSync(targetPath, 0o755);
                    }
                    catch {
                        /* non-fatal */
                    }
                }
            }
        }
    }
    results.push(mergePackageJson(repoRoot, options, globalInstall));
    return results;
}
function readDependencyBucket(value) {
    if (!value || typeof value !== 'object') {
        return {};
    }
    return Object.fromEntries(Object.entries(value).filter((entry) => typeof entry[0] === 'string' && typeof entry[1] === 'string'));
}
function isNpmInitPlaceholderTestScript(value) {
    return /^echo ['"]?Error: no test specified['"]? && exit 1$/u.test(value.trim());
}
//# sourceMappingURL=scaffold-base-kit.js.map