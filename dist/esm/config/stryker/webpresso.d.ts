export declare const webpressoConfig: {
    ignorePatterns: string[];
    packageManager: string;
    testRunner: string;
    plugins: string[];
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
export default webpressoConfig;
//# sourceMappingURL=webpresso.d.ts.map