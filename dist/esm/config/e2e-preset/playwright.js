export function createPlaywrightE2ePreset(options = {}) {
    return {
        testDir: options.testDir,
        timeout: options.timeout,
        fullyParallel: options.fullyParallel ?? true,
        reporter: [["list"]],
        use: {
            trace: options.trace ?? "retain-on-failure",
        },
    };
}
//# sourceMappingURL=playwright.js.map