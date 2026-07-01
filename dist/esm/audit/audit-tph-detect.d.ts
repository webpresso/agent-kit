/**
 * Pure detection logic for Testing Philosophy Helper (TPH) audit.
 * Zero I/O — accepts pre-read file contents, returns structured results.
 */
export interface Violation {
    file: string;
    severity: "ERROR" | "WARNING" | "INFO";
    rule: string;
    message: string;
    details?: string;
}
export interface MockInfo {
    path: string;
    hasBehavior: boolean;
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
export declare const DEFAULT_MAX_MOCKS = 3;
/**
 * Infrastructure/leaf packages that are OK to mock in unit tests.
 * Mocking these is INFO (advisory), not ERROR.
 * Service/business logic mocks remain ERROR.
 */
export declare const INFRA_MOCK_ALLOWLIST: Set<string>;
export declare function isInfraMock(mockPath: string): boolean;
/**
 * Check if a mock path is a local/relative path (same-package mock).
 * Local mocks (./  ../  #) are excluded from over-mocking counts
 * because they mock within the same package, not across boundaries.
 */
export declare function isLocalMock(mockPath: string): boolean;
export declare function isUnitTestFile(filePath: string): boolean;
/**
 * Pure detection function. Takes pre-read file contents, returns structured result.
 * No readFileSync, no glob, no runShell, no root param needed.
 */
export declare function detectTphViolations(files: FileInput[], options?: {
    maxMocks?: number;
}): AuditResult;
//# sourceMappingURL=audit-tph-detect.d.ts.map