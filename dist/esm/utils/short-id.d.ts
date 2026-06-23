type RandomBytesFn = (size: number) => Buffer;
/**
 * Return a filesystem-safe crypto-random short identifier.
 *
 * The output uses base36 characters (0-9, a-z) — filesystem-safe and
 * delimiter-free for path suffixes, SQLite row ids, and human-readable
 * local identifiers. Use `crypto.randomUUID()` when a full UUID is preferred.
 *
 * Rejection sampling ensures uniform distribution: bytes >= 252 are discarded
 * and the loop pulls more bytes until exactly `length` characters are accepted.
 */
export declare function shortId(length?: number): string;
export declare function _setRandomBytesForTests(impl: RandomBytesFn): void;
export declare function _resetRandomBytesForTests(): void;
export {};
//# sourceMappingURL=short-id.d.ts.map