/**
 * Shared Vitest configuration for React Router apps (pages)
 *
 * Usage in vitest.config.ts:
 * ```ts
 * import { reactRouterConfig } from '@webpresso/agent-vitest/react-router'
 * import { defineConfig, mergeConfig } from 'vite-plus/test/config'
 *
 * export default mergeConfig(reactRouterConfig, defineConfig({
 *   test: {
 *     setupFiles: ['./test/setup.ts'],
 *     env: {
 *       VITE_PUBLIC_APP_URL: 'http://localhost:3001',
 *     },
 *   },
 * }))
 * ```
 */
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus/test/config';
import { createFlakinessReporter } from './flakiness-reporter.js';
import { generatedRuntimeAliases, generatedRuntimeDedupe } from './generated-runtime-aliases.js';
import { resolvedExecArgv, resolvedMaxWorkers, resolvedMinWorkers, resolvedPool, } from './pool-defaults.js';
import { assertNonWorkersVitest4 } from './version-guard.js';
assertNonWorkersVitest4({ caller: 'reactRouterConfig' });
export const reactRouterConfig = defineConfig({
    plugins: [react()],
    resolve: {
        alias: [...generatedRuntimeAliases],
        dedupe: generatedRuntimeDedupe,
        tsconfigPaths: true,
    },
    test: {
        globals: true,
        // happy-dom is ~40% faster than jsdom
        environment: 'happy-dom',
        pool: resolvedPool,
        maxWorkers: resolvedMaxWorkers,
        minWorkers: resolvedMinWorkers,
        execArgv: resolvedExecArgv,
        // React Router apps use app/ directory
        include: ['app/**/*.test.{ts,tsx}'],
        exclude: ['**/.stryker-tmp/**', 'node_modules/**'],
        reporters: ['default', createFlakinessReporter()],
        retry: process.env.CI ? 2 : 0,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html', 'lcov'],
            include: ['app/**/*.{ts,tsx}'],
            exclude: [
                'node_modules/',
                'test/',
                '**/*.d.ts',
                '**/*.config.*',
                '**/mockData',
                'build/',
                'dist/',
                '.react-router/',
                '**/*.test.{ts,tsx}',
                '**/*.spec.{ts,tsx}',
                '**/index.{ts,tsx}',
                '**/types.ts',
                '**/types.tsx',
                '**/types/**',
                // React Router specific
                'app/routes.ts',
                'app/entry.*.tsx',
                'app/root.tsx',
            ],
            thresholds: {
                lines: 95,
                branches: 90,
                functions: 95,
                statements: 95,
            },
        },
    },
    optimizeDeps: {
        include: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
    },
});
export default reactRouterConfig;
