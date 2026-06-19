/**
 * Validates that a path is a safe relative path with no traversal or absolute references.
 *
 * Returns false if the path:
 * - Contains `..` (directory traversal)
 * - Starts with `/` (Unix absolute)
 * - Starts with a drive letter like `C:\` (Windows absolute)
 * - Starts with `\\` (Windows UNC)
 */
export function isValidRelativePath(path) {
    if (path.includes('..')) {
        return false;
    }
    if (path.startsWith('/')) {
        return false;
    }
    if (/^[A-Za-z]:[\\/]/.test(path)) {
        return false;
    }
    if (path.startsWith('\\\\')) {
        return false;
    }
    return true;
}
//# sourceMappingURL=validate-path.js.map