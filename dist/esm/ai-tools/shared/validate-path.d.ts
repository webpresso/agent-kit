/**
 * Validates that a path is a safe relative path with no traversal or absolute references.
 *
 * Returns false if the path:
 * - Contains `..` (directory traversal)
 * - Starts with `/` (Unix absolute)
 * - Starts with a drive letter like `C:\` (Windows absolute)
 * - Starts with `\\` (Windows UNC)
 */
export declare function isValidRelativePath(path: string): boolean;
//# sourceMappingURL=validate-path.d.ts.map