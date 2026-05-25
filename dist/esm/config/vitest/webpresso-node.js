import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite-plus/test/config';
import { createFlakinessReporter } from './flakiness-reporter.js';
import { webpressoGeneratedRuntimeAliases } from './webpresso-generated-runtime-aliases.js';
import { resolvedExecArgv, resolvedMaxWorkers, resolvedPool } from './pool-defaults.js';
import { assertNonWorkersVitest4 } from './version-guard.js';
assertNonWorkersVitest4({ caller: 'webpressoNodeConfig' });
// Route bun:sqlite → better-sqlite3 shim so Node-based vitest can load `webpresso/blueprint`.
const bunSqliteAlias = [
    {
        find: /^bun:sqlite$/,
        replacement: fileURLToPath(new URL('../../__mocks__/bun-sqlite.js', import.meta.url)),
    },
];
export function createWebpressoNodeProjects(name, options = {}) {
    const unitInclude = options.unitInclude ?? [
        'src/**/*.test.ts',
        'src/**/__tests__/**/*.test.{ts,tsx}',
        'src/**/__tests__/**/*.spec.{ts,tsx}',
    ];
    const extraUnitExclude = options.unitExclude ?? [];
    const integrationInclude = options.integrationInclude ?? ['src/**/*.integration.test.ts'];
    const projectMaxWorkers = options.maxWorkers ?? resolvedMaxWorkers;
    const projectFileParallelism = options.fileParallelism;
    const projectIsolate = options.isolate;
    const projectTestTimeout = options.testTimeout;
    const sharedResolve = {
        alias: [...webpressoGeneratedRuntimeAliases, ...bunSqliteAlias],
        tsconfigPaths: true,
        conditions: ['@webpresso/source'],
    };
    const sharedServer = {
        deps: {
            inline: [/^@webpresso/],
        },
    };
    return [
        {
            resolve: sharedResolve,
            server: sharedServer,
            test: {
                name: `${name}/unit`,
                globals: true,
                restoreMocks: true,
                environment: 'node',
                pool: resolvedPool,
                maxWorkers: projectMaxWorkers,
                fileParallelism: projectFileParallelism,
                isolate: projectIsolate,
                ...(projectTestTimeout !== undefined && { testTimeout: projectTestTimeout }),
                include: unitInclude,
                exclude: [
                    '**/*.integration.test.ts',
                    '**/.stryker-tmp/**',
                    'node_modules/**',
                    ...extraUnitExclude,
                ],
            },
        },
        {
            resolve: sharedResolve,
            server: sharedServer,
            test: {
                name: `${name}/integration`,
                globals: true,
                restoreMocks: true,
                environment: 'node',
                pool: resolvedPool,
                maxWorkers: projectMaxWorkers,
                fileParallelism: projectFileParallelism,
                isolate: projectIsolate,
                ...(projectTestTimeout !== undefined && { testTimeout: projectTestTimeout }),
                execArgv: resolvedExecArgv,
                onConsoleLog: () => false,
                silent: process.env.VITEST_CONSOLE === '1' ? false : 'passed-only',
                setupFiles: [fileURLToPath(new URL('./node-setup.js', import.meta.url))],
                include: integrationInclude,
                exclude: ['**/.stryker-tmp/**', 'node_modules/**'],
                reporters: ['default', createFlakinessReporter()],
                retry: process.env.CI ? 2 : 0,
            },
        },
    ];
}
export const webpressoNodeConfig = defineConfig({
    resolve: {
        alias: [...webpressoGeneratedRuntimeAliases, ...bunSqliteAlias],
        tsconfigPaths: true,
        // Honor workspace packages' `@webpresso/source` export condition so
        // vitest resolves to .ts source instead of dist artifacts. Without
        // this, fresh-clone tests fail with "Cannot find module" against
        // packages that haven't been built yet.
        conditions: ['@webpresso/source'],
    },
    test: {
        globals: true,
        restoreMocks: true,
        environment: 'node',
        setupFiles: [fileURLToPath(new URL('./node-setup.js', import.meta.url))],
        onConsoleLog: () => false,
        pool: resolvedPool,
        silent: process.env.VITEST_CONSOLE === '1' ? false : 'passed-only',
        maxWorkers: resolvedMaxWorkers,
        execArgv: resolvedExecArgv,
        teardownTimeout: 10000,
        include: [
            'src/**/*.test.ts',
            'src/**/__tests__/**/*.test.{ts,tsx}',
            'src/**/__tests__/**/*.spec.{ts,tsx}',
        ],
        exclude: ['**/.stryker-tmp/**', 'node_modules/**'],
        reporters: ['default', createFlakinessReporter()],
        retry: process.env.CI ? 2 : 0,
        server: {
            deps: {
                inline: [/^@webpresso/],
            },
        },
        coverage: {
            provider: 'istanbul',
            reporter: ['text', 'json', 'html', 'lcov'],
            include: ['src/**/*.ts'],
            exclude: [
                'node_modules/',
                'dist/',
                '**/*.d.ts',
                '**/*.config.*',
                '**/tests/**',
                '**/__tests__/**',
                '**/__test-utils__/**',
                '**/*.test.ts',
                '**/*.spec.ts',
                '**/index.ts',
                '**/types.ts',
                '**/types/**',
            ],
            thresholds: {
                lines: 80,
                branches: 75,
                functions: 80,
                statements: 80,
            },
        },
    },
});
export default webpressoNodeConfig;
//# sourceMappingURL=webpresso-node.js.map