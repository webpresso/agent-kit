import { resolveOutputPolicy, type ManagedRunnerResolution, type ResolveRunnerOptions, type ManagedRunnerOutputPolicy } from './resolve-runner.js';
export declare function getManagedRunner(tool: string, options?: ResolveRunnerOptions): ManagedRunnerResolution;
export declare function clearManagedRunnerCache(): void;
export declare function setRtkAvailabilityProbeForTest(value: boolean | null): void;
export { resolveOutputPolicy };
export type { ManagedRunnerOutputPolicy, ManagedRunnerResolution, ResolveRunnerOptions };
//# sourceMappingURL=index.d.ts.map