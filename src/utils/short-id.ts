import { randomBytes } from 'node:crypto'

const DEFAULT_SHORT_ID_LENGTH = 8

/**
 * Return a filesystem-safe crypto-random short identifier.
 *
 * The output uses lowercase hexadecimal characters only, so it is safe for path
 * suffixes, SQLite row ids, and human-readable local identifiers. Use
 * `crypto.randomUUID()` directly when a full temporary-file UUID is preferred.
 */
export function shortId(length = DEFAULT_SHORT_ID_LENGTH): string {
  if (!Number.isInteger(length) || length < 1) {
    throw new RangeError('shortId length must be a positive integer')
  }

  return randomBytes(Math.ceil(length / 2))
    .toString('hex')
    .slice(0, length)
}
