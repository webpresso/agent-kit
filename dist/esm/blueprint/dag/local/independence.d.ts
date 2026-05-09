import type { IPackageGraph } from '#dag/interfaces';
/**
 * Represents a task with its file access information.
 */
export interface TaskFiles {
    id: string;
    files: string[];
    readOnly: boolean;
}
/**
 * Result of parallelization analysis.
 */
export interface ParallelizeResult {
    canParallelize: boolean;
    reason: string;
    /** Files that would conflict if parallelized */
    conflictingFiles?: string[];
}
/**
 * A false dependency that can be removed.
 */
export interface FalseDependency {
    from: string;
    to: string;
    reason: string;
}
/**
 * Analysis result for a pair of tasks.
 */
export interface TaskPairAnalysis {
    taskA: string;
    taskB: string;
    canParallelize: boolean;
    reason: string;
    packagesA: string[];
    packagesB: string[];
    overlappingFiles: string[];
    hasCrossPackageDependency: boolean;
}
/**
 * IndependenceDetector analyzes tasks to find false dependencies.
 *
 * Uses file and package analysis to determine if tasks can run in parallel,
 * even when the plan declares a dependency between them.
 *
 * Accepts IPackageGraph interface for testability - package structure can be mocked.
 */
export declare class IndependenceDetector {
    private readonly packageGraph;
    /**
     * Create a new IndependenceDetector.
     * @param rootOrPackageGraph - Either a root path (creates real PackageGraph) or an IPackageGraph for testing
     */
    constructor(rootOrPackageGraph: string | IPackageGraph);
    /**
     * Determine if two tasks can run in parallel based on their file access.
     *
     * Algorithm:
     * 1. Get package for each file (walk up to package.json)
     * 2. IF different packages AND no cross-package deps → PARALLEL
     * 3. IF same package but no file overlap → PARALLEL
     * 4. IF file overlap but both read-only → PARALLEL
     * 5. ELSE → SERIAL
     */
    canParallelize(taskA: TaskFiles, taskB: TaskFiles): ParallelizeResult;
    private analyzePackageLocation;
    private analyzeFilesOutsidePackages;
    private analyzeDifferentPackages;
    private analyzeSamePackage;
    /**
     * Analyze a pair of tasks in detail.
     * Useful for debugging why tasks can or cannot be parallelized.
     */
    analyzeTaskPair(taskA: TaskFiles, taskB: TaskFiles): TaskPairAnalysis;
    /**
     * Find all false dependencies in a task graph.
     *
     * @param tasks - List of tasks with their file information
     * @param edges - List of declared dependencies (from → to)
     * @returns List of edges that can be safely removed
     */
    findFalseDependencies(tasks: TaskFiles[], edges: Array<{
        from: string;
        to: string;
    }>): FalseDependency[];
    /**
     * Analyze all task pairs and return detailed analysis.
     * Useful for understanding the parallelization potential of a task set.
     */
    analyzeAllPairs(tasks: TaskFiles[]): {
        totalPairs: number;
        parallelizablePairs: number;
        analyses: TaskPairAnalysis[];
    };
    private getPackagesForFiles;
    private hasOverlap;
    private hasCrossPackageDep;
    private anyDependsOn;
    private getOverlappingFiles;
}
/**
 * Create a mock package graph for testing.
 * @param packages - Map of file paths to package roots
 * @param dependencies - Map of package roots to their dependencies
 */
export declare function createMockPackageGraph(packages: Map<string, string | null>, dependencies?: Map<string, string[]>): IPackageGraph;
//# sourceMappingURL=independence.d.ts.map