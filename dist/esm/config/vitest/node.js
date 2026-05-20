/**
 * Shared Vitest configuration for Node.js packages
 *
 * Usage in vitest.config.ts:
 * ```ts
 * import { nodeConfig } from '@webpresso/agent-vitest/node'
 * import { defineConfig, mergeConfig } from 'vite-plus/test/config'
 *
 * export default mergeConfig(nodeConfig, defineConfig({
 *   // Your overrides here
 * }))
 * ```
 */
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite-plus/test/config';
import { createFlakinessReporter } from './flakiness-reporter.js';
import { generatedRuntimeAliases } from './generated-runtime-aliases.js';
import { resolvedExecArgv, resolvedMaxWorkers, resolvedPool } from './pool-defaults.js';
import { assertNonWorkersVitest4 } from './version-guard.js';
const __dirname = dirname(fileURLToPath(import.meta.url));
assertNonWorkersVitest4({ caller: 'nodeConfig' });
// Route bun:sqlite → better-sqlite3 shim so Node-based vitest can load `@webpresso/agent-kit/blueprint`.
const bunSqliteAlias = [
    {
        find: /^bun:sqlite$/,
        replacement: fileURLToPath(new URL('../../__mocks__/bun-sqlite.js', import.meta.url)),
    },
];
/**
 * Create vitest projects for unit/integration test split.
 *
 * Usage in vitest.config.ts:
 * ```ts
 * import { nodeConfig, createNodeProjects } from '@webpresso/agent-vitest/node'
 * import { mergeConfig } from 'vite-plus/test/config'
 *
 * export default mergeConfig(nodeConfig, {
 *   test: { projects: createNodeProjects('my-package') },
 * })
 * ```
 *
 * @param name - Package name used as vitest project name prefix (e.g. 'deploy' → 'deploy/unit', 'deploy/integration')
 * @param options - Optional overrides for unit/integration include patterns
 */
export function createNodeProjects(name, options = {}) {
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
        alias: [...generatedRuntimeAliases, ...bunSqliteAlias],
        tsconfigPaths: true,
    };
    return [
        {
            resolve: sharedResolve,
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
export const nodeConfig = defineConfig({
    resolve: {
        alias: [...generatedRuntimeAliases, ...bunSqliteAlias],
        tsconfigPaths: true,
    },
    test: {
        globals: true,
        restoreMocks: true,
        environment: 'node',
        setupFiles: [fileURLToPath(new URL('./node-setup.js', import.meta.url))],
        onConsoleLog: () => false, // Suppress all console output
        pool: resolvedPool,
        // Suppress console output in tests by default.
        // Tests should assert behavior, not log to stdout.
        // To see console output, run with VITEST_CONSOLE=1.
        silent: process.env.VITEST_CONSOLE === '1' ? false : 'passed-only',
        // Note: Vitest v4 removed poolOptions - maxWorkers are now top-level
        maxWorkers: resolvedMaxWorkers,
        // Cap each fork worker's V8 heap to 2GB (Node 24 default is 4.2GB).
        // Measured worker RSS is ~100-200MB; the cap just prevents runaway GC laziness.
        // OOM prevention relies on the shared workspace scheduler and capped workers,
        // not heap limits — process count is the dominant memory factor.
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
                '**/index.ts', // Common exclusion for barrel exports
                '**/types.ts',
                '**/types/**',
            ],
            // Industry-standard 80% coverage thresholds (Atlassian recommendation)
            // 80% catches critical gaps without excessive build failures
            // Branches at 75% as they're harder to cover comprehensively
            thresholds: {
                lines: 80,
                branches: 75,
                functions: 80,
                statements: 80,
            },
        },
    },
});
export default nodeConfig;
//# sourceMappingURL=node.js.map