import type { IPackageGraph } from '#dag/interfaces'

import { PackageGraph } from './package-graph.js'

/**
 * Represents a task with its file access information.
 */
export interface TaskFiles {
  id: string
  files: string[]
  readOnly: boolean
}

/**
 * Result of parallelization analysis.
 */
export interface ParallelizeResult {
  canParallelize: boolean
  reason: string
  /** Files that would conflict if parallelized */
  conflictingFiles?: string[]
}

/**
 * A false dependency that can be removed.
 */
export interface FalseDependency {
  from: string
  to: string
  reason: string
}

/**
 * Analysis result for a pair of tasks.
 */
export interface TaskPairAnalysis {
  taskA: string
  taskB: string
  canParallelize: boolean
  reason: string
  packagesA: string[]
  packagesB: string[]
  overlappingFiles: string[]
  hasCrossPackageDependency: boolean
}

/**
 * IndependenceDetector analyzes tasks to find false dependencies.
 *
 * Uses file and package analysis to determine if tasks can run in parallel,
 * even when the plan declares a dependency between them.
 *
 * Accepts IPackageGraph interface for testability - package structure can be mocked.
 */
export class IndependenceDetector {
  private readonly packageGraph: IPackageGraph

  /**
   * Create a new IndependenceDetector.
   * @param rootOrPackageGraph - Either a root path (creates real PackageGraph) or an IPackageGraph for testing
   */
  constructor(rootOrPackageGraph: string | IPackageGraph) {
    if (typeof rootOrPackageGraph === 'string') {
      this.packageGraph = new PackageGraph(rootOrPackageGraph)
    } else {
      this.packageGraph = rootOrPackageGraph
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
  canParallelize(taskA: TaskFiles, taskB: TaskFiles): ParallelizeResult {
    if (!taskA.files.length || !taskB.files.length) {
      return { canParallelize: true, reason: 'one or both tasks have no files' }
    }

    const packagesA = this.getPackagesForFiles(taskA.files)
    const packagesB = this.getPackagesForFiles(taskB.files)

    return this.analyzePackageLocation(taskA, taskB, packagesA, packagesB)
  }

  private analyzePackageLocation(
    taskA: TaskFiles,
    taskB: TaskFiles,
    packagesA: Set<string>,
    packagesB: Set<string>,
  ): ParallelizeResult {
    // If one has packages and the other doesn't, they're in different locations
    if (packagesA.size === 0 && packagesB.size > 0) {
      return { canParallelize: true, reason: 'different locations (packaged vs unpackaged)' }
    }
    if (packagesB.size === 0 && packagesA.size > 0) {
      return { canParallelize: true, reason: 'different locations (packaged vs unpackaged)' }
    }

    // If both are outside packages, check file overlap
    if (packagesA.size === 0 && packagesB.size === 0) {
      return this.analyzeFilesOutsidePackages(taskA, taskB)
    }

    if (!this.hasOverlap(packagesA, packagesB)) {
      return this.analyzeDifferentPackages(packagesA, packagesB)
    }

    return this.analyzeSamePackage(taskA, taskB)
  }

  private analyzeFilesOutsidePackages(taskA: TaskFiles, taskB: TaskFiles): ParallelizeResult {
    const overlappingFiles = this.getOverlappingFiles(taskA.files, taskB.files)
    if (!overlappingFiles.length) {
      return { canParallelize: true, reason: 'files outside packages, no overlap' }
    }
    if (taskA.readOnly && taskB.readOnly) {
      return { canParallelize: true, reason: 'files outside packages, overlap but read-only' }
    }
    return {
      canParallelize: false,
      reason: 'files outside packages with write conflict',
      conflictingFiles: overlappingFiles,
    }
  }

  private analyzeDifferentPackages(
    packagesA: Set<string>,
    packagesB: Set<string>,
  ): ParallelizeResult {
    // If one is the root package and the other is not, they can parallelize
    // Root package is a meta/dev package and its dependencies don't create real conflicts
    const hasRoot = packagesA.has('') || packagesB.has('')
    const hasNonRoot =
      Array.from(packagesA).some((p) => p !== '') || Array.from(packagesB).some((p) => p !== '')
    if (hasRoot && hasNonRoot) {
      return { canParallelize: true, reason: 'root package vs workspace package, no conflict' }
    }

    const hasCrossDep = this.hasCrossPackageDep(packagesA, packagesB)
    if (!hasCrossDep) {
      return { canParallelize: true, reason: 'different packages, no cross-dep' }
    }
    return { canParallelize: false, reason: 'cross-package dependency exists' }
  }

  private analyzeSamePackage(taskA: TaskFiles, taskB: TaskFiles): ParallelizeResult {
    const overlappingFiles = this.getOverlappingFiles(taskA.files, taskB.files)
    if (!overlappingFiles.length) {
      return { canParallelize: true, reason: 'same package, no file overlap' }
    }
    if (taskA.readOnly && taskB.readOnly) {
      return { canParallelize: true, reason: 'file overlap but both read-only' }
    }
    return {
      canParallelize: false,
      reason: `file overlap with write conflict: ${overlappingFiles.join(', ')}`,
      conflictingFiles: overlappingFiles,
    }
  }

  /**
   * Analyze a pair of tasks in detail.
   * Useful for debugging why tasks can or cannot be parallelized.
   */
  analyzeTaskPair(taskA: TaskFiles, taskB: TaskFiles): TaskPairAnalysis {
    const packagesA = this.getPackagesForFiles(taskA.files)
    const packagesB = this.getPackagesForFiles(taskB.files)
    const overlappingFiles = this.getOverlappingFiles(taskA.files, taskB.files)
    const hasCrossDep = this.hasCrossPackageDep(packagesA, packagesB)
    const result = this.canParallelize(taskA, taskB)

    return {
      taskA: taskA.id,
      taskB: taskB.id,
      canParallelize: result.canParallelize,
      reason: result.reason,
      packagesA: Array.from(packagesA),
      packagesB: Array.from(packagesB),
      overlappingFiles,
      hasCrossPackageDependency: hasCrossDep,
    }
  }

  /**
   * Find all false dependencies in a task graph.
   *
   * @param tasks - List of tasks with their file information
   * @param edges - List of declared dependencies (from → to)
   * @returns List of edges that can be safely removed
   */
  findFalseDependencies(
    tasks: TaskFiles[],
    edges: Array<{ from: string; to: string }>,
  ): FalseDependency[] {
    const taskMap = new Map(tasks.map((t) => [t.id, t]))
    const falseDeps: FalseDependency[] = []

    for (const edge of edges) {
      const taskA = taskMap.get(edge.from)
      const taskB = taskMap.get(edge.to)

      if (!taskA || !taskB) continue

      const result = this.canParallelize(taskA, taskB)

      if (result.canParallelize) {
        falseDeps.push({
          from: edge.from,
          to: edge.to,
          reason: result.reason,
        })
      }
    }

    return falseDeps
  }

  /**
   * Analyze all task pairs and return detailed analysis.
   * Useful for understanding the parallelization potential of a task set.
   */
  analyzeAllPairs(tasks: TaskFiles[]): {
    totalPairs: number
    parallelizablePairs: number
    analyses: TaskPairAnalysis[]
  } {
    const analyses: TaskPairAnalysis[] = []

    for (let i = 0; i < tasks.length; i++) {
      for (let j = i + 1; j < tasks.length; j++) {
        // Safe: loop conditions ensure i and j are within bounds
        const taskA = tasks[i]
        const taskB = tasks[j]
        if (!taskA || !taskB) continue
        analyses.push(this.analyzeTaskPair(taskA, taskB))
      }
    }

    return {
      totalPairs: analyses.length,
      parallelizablePairs: analyses.filter((a) => a.canParallelize).length,
      analyses,
    }
  }

  private getPackagesForFiles(files: string[]): Set<string> {
    const packages = new Set<string>()

    for (const file of files) {
      const pkg = this.packageGraph.findPackageRoot(file)
      if (pkg !== null) {
        packages.add(pkg)
      }
    }

    return packages
  }

  private hasOverlap(setA: Set<string>, setB: Set<string>): boolean {
    for (const item of setA) {
      if (setB.has(item)) return true
    }
    return false
  }

  private hasCrossPackageDep(packagesA: Set<string>, packagesB: Set<string>): boolean {
    // Check if any package in A depends on any package in B (or vice versa)
    for (const pkgA of packagesA) {
      if (this.anyDependsOn(pkgA, packagesB)) return true
    }
    for (const pkgB of packagesB) {
      if (this.anyDependsOn(pkgB, packagesA)) return true
    }
    return false
  }

  private anyDependsOn(pkg: string, targets: Set<string>): boolean {
    for (const target of targets) {
      if (this.packageGraph.hasCrossPackageDependency(pkg, target)) return true
    }
    return false
  }

  private getOverlappingFiles(filesA: string[], filesB: string[]): string[] {
    const setB = new Set(filesB)
    return filesA.filter((f) => setB.has(f))
  }
}

/**
 * Create a mock package graph for testing.
 * @param packages - Map of file paths to package roots
 * @param dependencies - Map of package roots to their dependencies
 */
export function createMockPackageGraph(
  packages: Map<string, string | null>,
  dependencies: Map<string, string[]> = new Map(),
): IPackageGraph {
  return {
    findPackageRoot: (filePath: string) => packages.get(filePath) ?? null,
    getPackageName: (packageRoot: string) => packageRoot,
    hasCrossPackageDependency: (pkgA: string, pkgB: string) => {
      const deps = dependencies.get(pkgA) ?? []
      return deps.includes(pkgB)
    },
    areInSamePackage: (filePathA: string, filePathB: string) => {
      const pkgA = packages.get(filePathA)
      const pkgB = packages.get(filePathB)
      return pkgA !== null && pkgA === pkgB
    },
  }
}
