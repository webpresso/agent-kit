/**
 * Shared mutation-testing defaults for Webpresso packages.
 *
 * Import and extend this in package-root `stryker.config.mjs` files:
 *
 * @example
 * import { baseConfig } from '@webpresso/agent-kit/stryker'
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
/**
 * Extends baseConfig with TypeScript checker defaults.
 * Use this in any TypeScript package instead of baseConfig directly.
 *
 * @example
 * import { typescriptBaseConfig } from '@webpresso/agent-kit/stryker'
 *
 * export default { ...typescriptBaseConfig }
 * // or, for packages with a CF-pool vitest config:
 * export default { ...typescriptBaseConfig, vitest: { configFile: 'vitest.stryker.config.ts' } }
 */
export declare const typescriptBaseConfig: {
    checkers: string[];
    tsconfigFile: string;
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
/**
 * Extends typescriptBaseConfig for Cloudflare Workers packages whose vitest config
 * uses @cloudflare/vitest-pool-workers (incompatible with Stryker's pool injection).
 * Points to a per-package vitest.stryker.config.ts that uses the standard forks pool
 * and excludes any tests that require CF runtime globals (cloudflare:test).
 *
 * @example
 * import { typescriptWorkersBaseConfig } from '@webpresso/agent-kit/stryker'
 *
 * export default { ...typescriptWorkersBaseConfig }
 */
export declare const typescriptWorkersBaseConfig: {
    vitest: {
        configFile: string;
    };
    checkers: string[];
    tsconfigFile: string;
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