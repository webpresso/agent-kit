/**
 * Escape special regex characters in a string so it can be used safely
 * inside a `new RegExp(...)` constructor.
 *
 * Inlined as a pure helper to keep this package self-contained.
 */
export function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
export const escapeRegExp = escapeRegex;
//# sourceMappingURL=string.js.map