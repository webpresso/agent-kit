/**
 * Shared mutation-testing defaults for Webpresso packages.
 *
 * Import and extend this in package-root `stryker.config.mjs` files:
 *
 * @example
 * import { baseConfig } from 'webpresso/stryker'
 *
 * export default {
 *   ...baseConfig,
 *   vitest: { configFile: 'vitest.node.config.ts' },
 *   mutate: ['src/**\/*.ts', '!src/**\/*.test.ts'],
 * }
 */
export declare const baseConfig: {
    packageManager: string;
    testRunner: string;
    plugins: string[];
    ignorePatterns: string[];
    mutate: string[];
    concurrency: number;
    timeoutMS: number;
    dryRunTimeoutMinutes: number;
    ignoreStatic: boolean;
    thresholds: {
        high: number;
        low: number;
        break: number;
    };
    mutator: {
        excludedMutations: string[];
    };
    reporters: string[];
    htmlReporter: {
        fileName: string;
    };
    jsonReporter: {
        fileName: string;
    };
    incremental: boolean;
    incrementalFile: string;
};
export default baseConfig;
//# sourceMappingURL=index.d.ts.map