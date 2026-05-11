import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus/test/config';
import { createFlakinessReporter } from './flakiness-reporter.js';
import { webpressoGeneratedRuntimeAliases, webpressoGeneratedRuntimeDedupe, } from './webpresso-generated-runtime-aliases.js';
import { resolvedExecArgv, resolvedMaxWorkers, resolvedMinWorkers, resolvedPool, } from './pool-defaults.js';
import { assertNonWorkersVitest4 } from './version-guard.js';
assertNonWorkersVitest4({ caller: 'webpressoReactRouterConfig' });
export const webpressoReactRouterConfig = defineConfig({
    plugins: [react()],
    resolve: {
        alias: [...webpressoGeneratedRuntimeAliases],
        conditions: ['@webpresso/source'],
        dedupe: webpressoGeneratedRuntimeDedupe,
        tsconfigPaths: true,
    },
    test: {
        globals: true,
        environment: 'happy-dom',
        pool: resolvedPool,
        maxWorkers: resolvedMaxWorkers,
        minWorkers: resolvedMinWorkers,
        execArgv: resolvedExecArgv,
        include: ['app/**/*.test.{ts,tsx}'],
        exclude: ['**/.stryker-tmp/**', 'node_modules/**'],
        reporters: ['default', createFlakinessReporter()],
        retry: process.env.CI ? 2 : 0,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html', 'lcov'],
            include: ['app/**/*.{ts,tsx}'],
            exclude: [
                'node_modules/', 'test/', '**/*.d.ts', '**/*.config.*', '**/mockData',
                'build/', 'dist/', '.react-router/', '**/*.test.{ts,tsx}', '**/*.spec.{ts,tsx}',
                '**/index.{ts,tsx}', '**/types.ts', '**/types.tsx', '**/types/**',
                'app/routes.ts', 'app/entry.*.tsx', 'app/root.tsx',
            ],
            thresholds: { lines: 95, branches: 90, functions: 95, statements: 95 },
        },
    },
    optimizeDeps: {
        include: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
    },
});
export default webpressoReactRouterConfig;
