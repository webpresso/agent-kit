import { randomBytes } from "node:crypto";

const DEFAULT_SHORT_ID_LENGTH = 8;
const ALPHABET = "0123456789abcdefghijklmnopqrstuvwxyz";
// 252 = 7 × 36 is the largest multiple of 36 that fits in a byte.
// Bytes >= 252 are rejected so that byte % 36 is uniformly distributed.
const REJECT_THRESHOLD = 252;

type RandomBytesFn = (size: number) => Buffer;

let randomBytesFn: RandomBytesFn = randomBytes;

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
export function shortId(length = DEFAULT_SHORT_ID_LENGTH): string {
  if (!Number.isInteger(length) || length < 1) {
    throw new RangeError("shortId length must be a positive integer");
  }

  const chars: string[] = [];
  while (chars.length < length) {
    for (const byte of randomBytesFn(length - chars.length + 4)) {
      if (byte >= REJECT_THRESHOLD) continue;
      // byte is in 0..251 = 7 complete cycles of 36 — no modulo bias
      chars.push(ALPHABET[byte % 36] as string);
      if (chars.length === length) break;
    }
  }
  return chars.join("");
}

export function _setRandomBytesForTests(impl: RandomBytesFn): void {
  randomBytesFn = impl;
}

export function _resetRandomBytesForTests(): void {
  randomBytesFn = randomBytes;
}
