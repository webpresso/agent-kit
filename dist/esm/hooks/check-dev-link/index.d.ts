#!/usr/bin/env bun
import { STATE_FILE_RELATIVE_PATH, type DevLinkState, readDevLinkState } from '#dev/dev-link-state';
export interface DevLinkBreakage {
    expected: string;
    actual: string | null;
    packageName: string;
    projectDir: string;
}
export interface DetectOptions {
    cwd?: string;
}
export declare function detectDevLinkBreakage(options?: DetectOptions): DevLinkBreakage | null;
export declare function formatBreakageMessage(breakage: DevLinkBreakage): string;
export declare function buildSessionStartEnvelope(message: string): string;
export declare function buildOutput(cwd: string): string | null;
export declare function main(): Promise<void>;
export { STATE_FILE_RELATIVE_PATH, readDevLinkState };
export type { DevLinkState };
//# sourceMappingURL=index.d.ts.map