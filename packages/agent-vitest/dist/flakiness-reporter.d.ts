import type { Reporter } from 'vitest/reporters';
export interface FlakinessReporterOptions {
    outputFile?: string;
}
export declare function createFlakinessReporter(options?: FlakinessReporterOptions): Reporter;
export default createFlakinessReporter;
