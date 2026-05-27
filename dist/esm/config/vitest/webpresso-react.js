import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite-plus/test/config';
import { createFlakinessReporter } from './flakiness-reporter.js';
import { webpressoGeneratedRuntimeAliases, webpressoGeneratedRuntimeDedupe, } from './webpresso-generated-runtime-aliases.js';
import { resolvedExecArgv, resolvedMaxWorkers, resolvedMinWorkers, resolvedPool, } from './pool-defaults.js';
import { assertNonWorkersVitest4 } from './version-guard.js';
assertNonWorkersVitest4({ caller: 'webpressoReactConfig' });
export const webpressoReactConfig = defineConfig({
    plugins: [react()],
    resolve: {
        alias: [...webpressoGeneratedRuntimeAliases],
        conditions: ['@webpresso/source'],
        dedupe: webpressoGeneratedRuntimeDedupe,
        tsconfigPaths: true,
    },
    test: {
        globals: true,
        restoreAllMocks: true,
        environment: 'happy-dom',
        setupFiles: [],
        onConsoleLog: () => false,
        pool: resolvedPool,
        maxWorkers: resolvedMaxWorkers,
        minWorkers: resolvedMinWorkers,
        execArgv: resolvedExecArgv,
        include: ['src/**/*.test.{ts,tsx}', 'src/**/__tests__/**/*.{ts,tsx}'],
        exclude: ['**/.stryker-tmp/**', 'node_modules/**'],
        reporters: ['default', createFlakinessReporter()],
        retry: process.env.CI ? 2 : 0,
        coverage: {
            provider: 'v8',
            reporter: ['text', 'json', 'html', 'lcov'],
            include: ['src/**/*.{ts,tsx}'],
            exclude: [
                'node_modules/',
                'test/',
                '**/*.d.ts',
                '**/*.config.*',
                '**/mockData',
                'build/',
                'dist/',
                '**/*.test.{ts,tsx}',
                '**/*.spec.{ts,tsx}',
                '**/index.{ts,tsx}',
                '**/types.ts',
                '**/types.tsx',
                '**/types/**',
            ],
            thresholds: { lines: 80, branches: 75, functions: 80, statements: 80 },
        },
    },
    optimizeDeps: {
        include: ['react', 'react-dom', 'react/jsx-runtime', 'react/jsx-dev-runtime'],
    },
});
export default webpressoReactConfig;
//# sourceMappingURL=webpresso-react.js.map