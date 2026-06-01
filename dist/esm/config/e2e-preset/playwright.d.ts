export interface PlaywrightE2ePresetOptions {
    testDir?: string;
    timeout?: number;
    fullyParallel?: boolean;
    trace?: 'on' | 'off' | 'retain-on-failure' | 'on-first-retry';
}
export interface PlaywrightCompatibleConfig {
    testDir?: string;
    timeout?: number;
    fullyParallel: boolean;
    reporter: [string][];
    use: {
        trace: 'on' | 'off' | 'retain-on-failure' | 'on-first-retry';
    };
}
export declare function createPlaywrightE2ePreset(options?: PlaywrightE2ePresetOptions): PlaywrightCompatibleConfig;
//# sourceMappingURL=playwright.d.ts.map