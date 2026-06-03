/**
 * Shared Vitest configuration for Cloudflare Workers
 */
export declare const workersConfig: {
    resolve: {
        tsconfigPaths: boolean;
    };
    test: {
        globals: boolean;
        restoreMocks: boolean;
        reporters: string[];
        retry: number;
        coverage: {
            provider: string;
            reporter: string[];
            include: string[];
            exclude: string[];
            thresholds: {
                lines: number;
                branches: number;
                functions: number;
                statements: number;
            };
        };
    };
};
export default workersConfig;
//# sourceMappingURL=workers.d.ts.map