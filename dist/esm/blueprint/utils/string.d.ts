/**
 * Escape special regex characters in a string so it can be used safely
 * inside a `new RegExp(...)` constructor.
 *
 * Inlined as a pure helper to keep this package self-contained.
 */
export declare function escapeRegex(str: string): string;
export declare const escapeRegExp: typeof escapeRegex;
//# sourceMappingURL=string.d.ts.map