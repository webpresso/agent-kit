import { PackageGraph } from './package-graph.js';
/**
 * IndependenceDetector analyzes tasks to find false dependencies.
 *
 * Uses file and package analysis to determine if tasks can run in parallel,
 * even when the plan declares a dependency between them.
 *
 * Accepts IPackageGraph interface for testability - package structure can be mocked.
 */
export class IndependenceDetector {
    packageGraph;
    /**
     * Create a new IndependenceDetector.
     * @param rootOrPackageGraph - Either a root path (creates real PackageGraph) or an IPackageGraph for testing
     */
    constructor(rootOrPackageGraph) {
        if (typeof rootOrPackageGraph === 'string') {
            this.packageGraph = new PackageGraph(rootOrPackageGraph);
        }
        else {
            this.packageGraph = rootOrPackageGraph;
        }
    }
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
    canParallelize(taskA, taskB) {
        if (!taskA.files.length || !taskB.files.length) {
            return { canParallelize: true, reason: 'one or both tasks have no files' };
        }
        const packagesA = this.getPackagesForFiles(taskA.files);
        const packagesB = this.getPackagesForFiles(taskB.files);
        return this.analyzePackageLocation(taskA, taskB, packagesA, packagesB);
    }
    analyzePackageLocation(taskA, taskB, packagesA, packagesB) {
        // If one has packages and the other doesn't, they're in different locations
        if (packagesA.size === 0 && packagesB.size > 0) {
            return { canParallelize: true, reason: 'different locations (packaged vs unpackaged)' };
        }
        if (packagesB.size === 0 && packagesA.size > 0) {
            return { canParallelize: true, reason: 'different locations (packaged vs unpackaged)' };
        }
        // If both are outside packages, check file overlap
        if (packagesA.size === 0 && packagesB.size === 0) {
            return this.analyzeFilesOutsidePackages(taskA, taskB);
        }
        if (!this.hasOverlap(packagesA, packagesB)) {
            return this.analyzeDifferentPackages(packagesA, packagesB);
        }
        return this.analyzeSamePackage(taskA, taskB);
    }
    analyzeFilesOutsidePackages(taskA, taskB) {
        const overlappingFiles = this.getOverlappingFiles(taskA.files, taskB.files);
        if (!overlappingFiles.length) {
            return { canParallelize: true, reason: 'files outside packages, no overlap' };
        }
        if (taskA.readOnly && taskB.readOnly) {
            return { canParallelize: true, reason: 'files outside packages, overlap but read-only' };
        }
        return {
            canParallelize: false,
            reason: 'files outside packages with write conflict',
            conflictingFiles: overlappingFiles,
        };
    }
    analyzeDifferentPackages(packagesA, packagesB) {
        // If one is the root package and the other is not, they can parallelize
        // Root package is a meta/dev package and its dependencies don't create real conflicts
        const hasRoot = packagesA.has('') || packagesB.has('');
        const hasNonRoot = Array.from(packagesA).some((p) => p !== '') || Array.from(packagesB).some((p) => p !== '');
        if (hasRoot && hasNonRoot) {
            return { canParallelize: true, reason: 'root package vs workspace package, no conflict' };
        }
        const hasCrossDep = this.hasCrossPackageDep(packagesA, packagesB);
        if (!hasCrossDep) {
            return { canParallelize: true, reason: 'different packages, no cross-dep' };
        }
        return { canParallelize: false, reason: 'cross-package dependency exists' };
    }
    analyzeSamePackage(taskA, taskB) {
        const overlappingFiles = this.getOverlappingFiles(taskA.files, taskB.files);
        if (!overlappingFiles.length) {
            return { canParallelize: true, reason: 'same package, no file overlap' };
        }
        if (taskA.readOnly && taskB.readOnly) {
            return { canParallelize: true, reason: 'file overlap but both read-only' };
        }
        return {
            canParallelize: false,
            reason: `file overlap with write conflict: ${overlappingFiles.join(', ')}`,
            conflictingFiles: overlappingFiles,
        };
    }
    /**
     * Analyze a pair of tasks in detail.
     * Useful for debugging why tasks can or cannot be parallelized.
     */
    analyzeTaskPair(taskA, taskB) {
        const packagesA = this.getPackagesForFiles(taskA.files);
        const packagesB = this.getPackagesForFiles(taskB.files);
        const overlappingFiles = this.getOverlappingFiles(taskA.files, taskB.files);
        const hasCrossDep = this.hasCrossPackageDep(packagesA, packagesB);
        const result = this.canParallelize(taskA, taskB);
        return {
            taskA: taskA.id,
            taskB: taskB.id,
            canParallelize: result.canParallelize,
            reason: result.reason,
            packagesA: Array.from(packagesA),
            packagesB: Array.from(packagesB),
            overlappingFiles,
            hasCrossPackageDependency: hasCrossDep,
        };
    }
    /**
     * Find all false dependencies in a task graph.
     *
     * @param tasks - List of tasks with their file information
     * @param edges - List of declared dependencies (from → to)
     * @returns List of edges that can be safely removed
     */
    findFalseDependencies(tasks, edges) {
        const taskMap = new Map(tasks.map((t) => [t.id, t]));
        const falseDeps = [];
        for (const edge of edges) {
            const taskA = taskMap.get(edge.from);
            const taskB = taskMap.get(edge.to);
            if (!taskA || !taskB)
                continue;
            const result = this.canParallelize(taskA, taskB);
            if (result.canParallelize) {
                falseDeps.push({
                    from: edge.from,
                    to: edge.to,
                    reason: result.reason,
                });
            }
        }
        return falseDeps;
    }
    /**
     * Analyze all task pairs and return detailed analysis.
     * Useful for understanding the parallelization potential of a task set.
     */
    analyzeAllPairs(tasks) {
        const analyses = [];
        for (let i = 0; i < tasks.length; i++) {
            for (let j = i + 1; j < tasks.length; j++) {
                // Safe: loop conditions ensure i and j are within bounds
                const taskA = tasks[i];
                const taskB = tasks[j];
                if (!taskA || !taskB)
                    continue;
                analyses.push(this.analyzeTaskPair(taskA, taskB));
            }
        }
        return {
            totalPairs: analyses.length,
            parallelizablePairs: analyses.filter((a) => a.canParallelize).length,
            analyses,
        };
    }
    getPackagesForFiles(files) {
        const packages = new Set();
        for (const file of files) {
            const pkg = this.packageGraph.findPackageRoot(file);
            if (pkg !== null) {
                packages.add(pkg);
            }
        }
        return packages;
    }
    hasOverlap(setA, setB) {
        for (const item of setA) {
            if (setB.has(item))
                return true;
        }
        return false;
    }
    hasCrossPackageDep(packagesA, packagesB) {
        // Check if any package in A depends on any package in B (or vice versa)
        for (const pkgA of packagesA) {
            if (this.anyDependsOn(pkgA, packagesB))
                return true;
        }
        for (const pkgB of packagesB) {
            if (this.anyDependsOn(pkgB, packagesA))
                return true;
        }
        return false;
    }
    anyDependsOn(pkg, targets) {
        for (const target of targets) {
            if (this.packageGraph.hasCrossPackageDependency(pkg, target))
                return true;
        }
        return false;
    }
    getOverlappingFiles(filesA, filesB) {
        const setB = new Set(filesB);
        return filesA.filter((f) => setB.has(f));
    }
}
/**
 * Create a mock package graph for testing.
 * @param packages - Map of file paths to package roots
 * @param dependencies - Map of package roots to their dependencies
 */
export function createMockPackageGraph(packages, dependencies = new Map()) {
    return {
        findPackageRoot: (filePath) => packages.get(filePath) ?? null,
        getPackageName: (packageRoot) => packageRoot,
        hasCrossPackageDependency: (pkgA, pkgB) => {
            const deps = dependencies.get(pkgA) ?? [];
            return deps.includes(pkgB);
        },
        areInSamePackage: (filePathA, filePathB) => {
            const pkgA = packages.get(filePathA);
            const pkgB = packages.get(filePathB);
            return pkgA !== null && pkgA === pkgB;
        },
    };
}
//# sourceMappingURL=independence.js.map