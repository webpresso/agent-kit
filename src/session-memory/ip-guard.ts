import type { LookupAddress } from 'node:dns'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

const DEFAULT_LOOKUP_TIMEOUT_MS = 10_000

export interface InternalHostCheckOptions {
  signal?: AbortSignal
  timeoutMs?: number
}

function normalizeHostname(hostname: string): string {
  const trimmed = hostname.trim().toLowerCase()
  const withoutBrackets =
    trimmed.startsWith('[') && trimmed.endsWith(']') ? trimmed.slice(1, -1) : trimmed
  return withoutBrackets.endsWith('.') ? withoutBrackets.slice(0, -1) : withoutBrackets
}

function isCommonInternalHostname(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  )
}

function parseIpv4(address: string): number[] | undefined {
  const parts = address.split('.')
  if (parts.length !== 4) return undefined
  const octets = parts.map((part) => {
    if (!/^\d{1,3}$/u.test(part)) return Number.NaN
    return Number.parseInt(part, 10)
  })
  if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
    return undefined
  }
  return octets
}

function isInternalIpv4(address: string): boolean {
  const octets = parseIpv4(address)
  if (!octets) return false
  const [first = 0, second = 0] = octets
  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168)
  )
}

function expandIpv6(address: string): number[] | undefined {
  const lower = address.toLowerCase()
  if (lower.includes('.')) return undefined
  const [headRaw = '', tailRaw = ''] = lower.split('::')
  if (lower.split('::').length > 2) return undefined
  const head = headRaw.length > 0 ? headRaw.split(':') : []
  const tail = tailRaw.length > 0 ? tailRaw.split(':') : []
  const missing = lower.includes('::') ? 8 - head.length - tail.length : 0
  const groups = lower.includes('::')
    ? [...head, ...Array<string>(missing).fill('0'), ...tail]
    : head
  if (groups.length !== 8) return undefined
  const parsed = groups.map((group) => {
    if (!/^[0-9a-f]{1,4}$/u.test(group)) return Number.NaN
    return Number.parseInt(group, 16)
  })
  if (parsed.some((group) => !Number.isInteger(group) || group < 0 || group > 0xffff)) {
    return undefined
  }
  return parsed
}

function ipv4MappedIpv6Suffix(address: string): string | undefined {
  const prefix = '::ffff:'
  return address.toLowerCase().startsWith(prefix) ? address.slice(prefix.length) : undefined
}

function isInternalIpv6(address: string): boolean {
  const mapped = ipv4MappedIpv6Suffix(address)
  if (mapped && isInternalIpv4(mapped)) return true
  const groups = expandIpv6(address)
  if (!groups) return false
  const [first = 0] = groups
  return (
    address === '::1' ||
    (first >= 0xfe80 && first <= 0xfebf) ||
    (first >= 0xfc00 && first <= 0xfdff)
  )
}

function isInternalAddress(address: string): boolean {
  const normalized = normalizeHostname(address)
  const ipVersion = isIP(normalized)
  if (ipVersion === 4) return isInternalIpv4(normalized)
  if (ipVersion === 6) return isInternalIpv6(normalized)
  return false
}

async function boundedLookup(
  hostname: string,
  options: InternalHostCheckOptions,
): Promise<LookupAddress[]> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_LOOKUP_TIMEOUT_MS
  let timeout: ReturnType<typeof setTimeout> | undefined
  let removeAbortListener: (() => void) | undefined
  try {
    return await Promise.race([
      lookup(hostname, { all: true }),
      new Promise<never>((_resolve, reject) => {
        timeout = setTimeout(() => reject(new Error('DNS lookup timed out')), timeoutMs)
        if (!options.signal) return
        if (options.signal.aborted) {
          reject(new Error('DNS lookup aborted'))
          return
        }
        const abort = () => reject(new Error('DNS lookup aborted'))
        options.signal.addEventListener('abort', abort, { once: true })
        removeAbortListener = () => options.signal?.removeEventListener('abort', abort)
      }),
    ])
  } finally {
    if (timeout) clearTimeout(timeout)
    removeAbortListener?.()
  }
}

export async function isInternalHost(
  hostname: string,
  options: InternalHostCheckOptions = {},
): Promise<boolean> {
  const normalized = normalizeHostname(hostname)
  if (isCommonInternalHostname(normalized)) return true
  if (isIP(normalized)) return isInternalAddress(normalized)

  try {
    const addresses = await boundedLookup(normalized, options)
    return addresses.some((entry) => isInternalAddress(entry.address))
  } catch {
    return true
  }
}
