/**
 * Runner for the TPH audit — thin I/O layer.
 * Finds test files, reads contents, calls detectTphViolations, prints + exits.
 */
import { type AuditResult } from './audit-tph-detect.js';
export declare function printResults(result: AuditResult): void;
export declare function runTphAudit(root: string, options?: {
    maxMocks?: number;
}): Promise<void>;
//# sourceMappingURL=audit-tph-runner.d.ts.map