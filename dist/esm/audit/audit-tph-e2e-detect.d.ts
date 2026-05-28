/**
 * Pure detection logic for TPH E2E audit.
 * Zero I/O — accepts pre-read file contents, returns structured results.
 */
export interface Violation {
    file: string;
    severity: 'ERROR' | 'WARNING' | 'INFO';
    rule: string;
    message: string;
}
export interface AuditResult {
    filesChecked: number;
    violations: Violation[];
    errorCount: number;
    warningCount: number;
    infoCount: number;
}
export interface FileInput {
    path: string;
    contents: string;
}
/**
 * Pure detection function for E2E audit.
 * Takes pre-read file contents, returns structured result. No I/O.
 */
export declare function detectTphE2eViolations(files: FileInput[]): AuditResult;
//# sourceMappingURL=audit-tph-e2e-detect.d.ts.map