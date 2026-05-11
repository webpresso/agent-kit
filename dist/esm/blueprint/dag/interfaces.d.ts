/**
 * Interfaces for dependency injection and testability.
 *
 * These interfaces allow mocking of external dependencies (filesystem, time)
 * for deterministic testing.
 */
/**
 * Filesystem abstraction for package discovery.
 * Allows mocking filesystem access in tests.
 */
export interface IFileSystem {
    existsSync(path: string): boolean;
    readFileSync(path: string, encoding: 'utf-8'): string;
}
/**
 * Clock abstraction for time-dependent operations.
 * Allows deterministic testing of duration calculations.
 */
export interface IClock {
    now(): number;
}
/**
 * Default clock using Date.now()
 */
export declare const realClock: IClock;
/**
 * Package graph interface for dependency analysis.
 * Allows mocking package structure in tests.
 */
export interface IPackageGraph {
    findPackageRoot(filePath: string): string | null;
    getPackageName(packageRoot: string): string | null;
    hasCrossPackageDependency(pkgA: string, pkgB: string): boolean;
    areInSamePackage(filePathA: string, filePathB: string): boolean;
}
/**
 * Validation result for graph analysis.
 */
export interface ValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}
/**
 * Graph statistics for analysis.
 */
export interface GraphStats {
    nodeCount: number;
    edgeCount: number;
    maxDepth: number;
    maxWidth: number;
    waveCount: number;
    hasCycles: boolean;
    isolatedNodes: string[];
}
//# sourceMappingURL=interfaces.d.ts.map