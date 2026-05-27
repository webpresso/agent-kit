/**
 * Runner for the TPH E2E audit — thin I/O layer.
 * Finds e2e test files, reads contents, calls detectTphE2eViolations, prints + exits.
 */
import { type AuditResult } from './audit-tph-e2e-detect.js';
export declare function printResults(result: AuditResult): void;
export declare function runTphE2eAudit(root: string): Promise<void>;
//# sourceMappingURL=audit-tph-e2e-runner.d.ts.map