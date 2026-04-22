import type { IFileSystem, IPackageGraph } from '#dag/interfaces'

import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, relative } from 'node:path'

interface PackageJson {
  name: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

/**
 * Default filesystem implementation using Node.js fs module.
 */
export const realFileSystem: IFileSystem = {
  existsSync,
  readFileSync: (path: string, encoding: 'utf-8') => readFileSync(path, encoding),
}

/**
 * PackageGraph analyzes monorepo package structure for dependency detection.
 *
 * Used by the false dependency detector to determine if tasks can run in parallel
 * based on package boundaries and cross-package dependencies.
 *
 * Implements IPackageGraph interface for testability - filesystem can be mocked.
 */
export class PackageGraph implements IPackageGraph {
  private readonly root: string
  private readonly fs: IFileSystem
  private readonly packageCache = new Map<string, string | null>()
  private readonly packageJsonCache = new Map<string, PackageJson | null>()

  constructor(root: string, fs: IFileSystem = realFileSystem) {
    this.root = root
    this.fs = fs
  }

  /**
   * Find the package root (directory containing package.json) for a file path.
   * Walks up the directory tree until package.json is found.
   *
   * @param filePath - Relative path from monorepo root
   * @returns Relative path to package root, or null if not found
   */
  findPackageRoot(filePath: string): string | null {
    if (this.packageCache.has(filePath)) {
      return this.packageCache.get(filePath) ?? null
    }

    let currentDir = dirname(join(this.root, filePath))
    const rootAbs = this.root

    while (currentDir.length >= rootAbs.length) {
      const pkgJsonPath = join(currentDir, 'package.json')

      if (this.fs.existsSync(pkgJsonPath)) {
        const result = relative(this.root, currentDir)
        this.packageCache.set(filePath, result)
        return result
      }

      const parentDir = dirname(currentDir)
      if (parentDir === currentDir) break
      currentDir = parentDir
    }

    this.packageCache.set(filePath, null)
    return null
  }

  /**
   * Get the package name from package.json.
   *
   * @param packageRoot - Relative path to package root
   * @returns Package name or null if not found
   */
  getPackageName(packageRoot: string): string | null {
    const pkgJson = this.loadPackageJson(packageRoot)
    return pkgJson?.name ?? null
  }

  /**
   * Check if package A has a dependency on package B.
   *
   * @param packageRootA - Relative path to first package
   * @param packageRootB - Relative path to second package
   * @returns True if A depends on B (directly)
   */
  hasCrossPackageDependency(packageRootA: string, packageRootB: string): boolean {
    const pkgA = this.loadPackageJson(packageRootA)
    const pkgB = this.loadPackageJson(packageRootB)

    if (!pkgA || !pkgB) return false

    const bName = pkgB.name
    const aDeps = {
      ...pkgA.dependencies,
      ...pkgA.devDependencies,
    }

    return bName in aDeps
  }

  /**
   * Check if two file paths belong to the same package.
   *
   * @param filePathA - First file path (relative)
   * @param filePathB - Second file path (relative)
   * @returns True if both files are in the same package
   */
  areInSamePackage(filePathA: string, filePathB: string): boolean {
    const pkgA = this.findPackageRoot(filePathA)
    const pkgB = this.findPackageRoot(filePathB)

    if (pkgA === null || pkgB === null) return false

    return pkgA === pkgB
  }

  /**
   * Clear all caches. Useful for testing or when package structure changes.
   */
  clearCache(): void {
    this.packageCache.clear()
    this.packageJsonCache.clear()
  }

  /**
   * Get all cached package roots.
   */
  getCachedPackageRoots(): string[] {
    return Array.from(this.packageCache.values()).filter((v): v is string => v !== null)
  }

  private loadPackageJson(packageRoot: string): PackageJson | null {
    if (this.packageJsonCache.has(packageRoot)) {
      return this.packageJsonCache.get(packageRoot) ?? null
    }

    const pkgJsonPath = join(this.root, packageRoot, 'package.json')

    if (!this.fs.existsSync(pkgJsonPath)) {
      this.packageJsonCache.set(packageRoot, null)
      return null
    }

    try {
      const content = this.fs.readFileSync(pkgJsonPath, 'utf-8')
      const parsed = JSON.parse(content) as PackageJson
      this.packageJsonCache.set(packageRoot, parsed)
      return parsed
    } catch {
      this.packageJsonCache.set(packageRoot, null)
      return null
    }
  }
}

/**
 * Create a mock filesystem for testing.
 * @param files - Map of file paths to contents (or null for non-existent)
 */
export function createMockFileSystem(files: Map<string, string | null>): IFileSystem {
  return {
    existsSync: (path: string) => files.has(path) && files.get(path) !== null,
    readFileSync: (path: string, _encoding: 'utf-8') => {
      const content = files.get(path)
      if (content === null || content === undefined) {
        throw new Error(`ENOENT: no such file or directory, open '${path}'`)
      }
      return content
    },
  }
}
