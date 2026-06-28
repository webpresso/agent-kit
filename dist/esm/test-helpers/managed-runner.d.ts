export interface ManagedRunnerHarnessOptions {
    readonly rtkAvailable?: boolean;
}
/**
 * Pin managed-runner RTK availability for one test module so command-shape
 * assertions stay hermetic regardless of the host PATH or CI image.
 *
 * Tests that need a different lane can still override the probe explicitly in
 * their own body; this hook only establishes the per-test baseline.
 */
export declare function installManagedRunnerHermeticHooks(options?: ManagedRunnerHarnessOptions): void;
//# sourceMappingURL=managed-runner.d.ts.map