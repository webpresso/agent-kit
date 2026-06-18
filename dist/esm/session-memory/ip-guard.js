import { lookup } from 'node:dns/promises';
import { isIP } from 'node:net';
const DEFAULT_LOOKUP_TIMEOUT_MS = 10_000;
export function normalizeHostname(hostname) {
    const trimmed = hostname.trim().toLowerCase();
    const withoutBrackets = trimmed.startsWith('[') && trimmed.endsWith(']') ? trimmed.slice(1, -1) : trimmed;
    return withoutBrackets.endsWith('.') ? withoutBrackets.slice(0, -1) : withoutBrackets;
}
function isCommonInternalHostname(hostname) {
    return (hostname === 'localhost' ||
        hostname.endsWith('.localhost') ||
        hostname.endsWith('.local') ||
        hostname.endsWith('.internal'));
}
function parseIpv4(address) {
    const parts = address.split('.');
    if (parts.length !== 4)
        return undefined;
    const octets = parts.map((part) => {
        if (!/^\d{1,3}$/u.test(part))
            return Number.NaN;
        return Number.parseInt(part, 10);
    });
    if (octets.some((octet) => !Number.isInteger(octet) || octet < 0 || octet > 255)) {
        return undefined;
    }
    return octets;
}
function isInternalIpv4(address) {
    const octets = parseIpv4(address);
    if (!octets)
        return false;
    const [first = 0, second = 0, third = 0] = octets;
    return (first === 0 ||
        first === 10 ||
        (first === 100 && second >= 64 && second <= 127) ||
        first === 127 ||
        (first === 169 && second === 254) ||
        (first === 172 && second >= 16 && second <= 31) ||
        (first === 192 && second === 0 && (third === 0 || third === 2)) ||
        (first === 192 && second === 168) ||
        (first === 198 && (second === 18 || second === 19)) ||
        (first === 198 && second === 51 && third === 100) ||
        (first === 203 && second === 0 && third === 113));
}
function expandIpv6(address) {
    const lower = address.toLowerCase();
    if (lower.includes('.'))
        return undefined;
    const [headRaw = '', tailRaw = ''] = lower.split('::');
    if (lower.split('::').length > 2)
        return undefined;
    const head = headRaw.length > 0 ? headRaw.split(':') : [];
    const tail = tailRaw.length > 0 ? tailRaw.split(':') : [];
    const missing = lower.includes('::') ? 8 - head.length - tail.length : 0;
    const groups = lower.includes('::')
        ? [...head, ...Array(missing).fill('0'), ...tail]
        : head;
    if (groups.length !== 8)
        return undefined;
    const parsed = groups.map((group) => {
        if (!/^[0-9a-f]{1,4}$/u.test(group))
            return Number.NaN;
        return Number.parseInt(group, 16);
    });
    if (parsed.some((group) => !Number.isInteger(group) || group < 0 || group > 0xffff)) {
        return undefined;
    }
    return parsed;
}
function ipv4MappedIpv6Suffix(address) {
    const prefix = '::ffff:';
    const lower = address.toLowerCase();
    if (!lower.startsWith(prefix))
        return undefined;
    const suffix = lower.slice(prefix.length);
    const dotted = parseIpv4(suffix);
    if (dotted)
        return dotted.join('.');
    const groups = suffix.split(':');
    if (groups.length !== 2)
        return undefined;
    const parsed = groups.map((group) => {
        if (!/^[0-9a-f]{1,4}$/u.test(group))
            return Number.NaN;
        return Number.parseInt(group, 16);
    });
    if (parsed.some((group) => !Number.isInteger(group) || group < 0 || group > 0xffff)) {
        return undefined;
    }
    const [high = 0, low = 0] = parsed;
    return [(high >> 8) & 0xff, high & 0xff, (low >> 8) & 0xff, low & 0xff].join('.');
}
function embeddedIpv4Suffix(groups) {
    const high = groups[6] ?? 0;
    const low = groups[7] ?? 0;
    return [(high >> 8) & 0xff, high & 0xff, (low >> 8) & 0xff, low & 0xff].join('.');
}
function isInternalIpv6(address) {
    const mapped = ipv4MappedIpv6Suffix(address);
    if (mapped && isInternalIpv4(mapped))
        return true;
    const groups = expandIpv6(address);
    if (!groups)
        return false;
    const [first = 0, second = 0, third = 0, fourth = 0] = groups;
    const allZero = groups.every((group) => group === 0);
    const ipv4Compatible = groups.slice(0, 6).every((group) => group === 0);
    const ipv4Mapped = groups.slice(0, 5).every((group) => group === 0) && groups[5] === 0xffff;
    const nat64WellKnown = first === 0x0064 && second === 0xff9b && groups.slice(2, 6).every((group) => group === 0);
    return (allZero ||
        address === '::1' ||
        ipv4Compatible ||
        (ipv4Mapped && isInternalIpv4(embeddedIpv4Suffix(groups))) ||
        (nat64WellKnown && isInternalIpv4(embeddedIpv4Suffix(groups))) ||
        (first === 0x0064 && second === 0xff9b && third === 0x0001) ||
        (first === 0x0100 && second === 0 && third === 0 && fourth === 0) ||
        first === 0x2002 ||
        (first === 0x2001 && second === 0x0002 && third === 0) ||
        (first === 0x2001 && second === 0x0db8) ||
        (first >= 0xfe80 && first <= 0xfebf) ||
        (first >= 0xfc00 && first <= 0xfdff) ||
        (first >= 0xff00 && first <= 0xffff));
}
export function isInternalAddress(address) {
    const normalized = normalizeHostname(address);
    const ipVersion = isIP(normalized);
    if (ipVersion === 4)
        return isInternalIpv4(normalized);
    if (ipVersion === 6)
        return isInternalIpv6(normalized);
    return false;
}
async function boundedLookup(hostname, options) {
    const timeoutMs = options.timeoutMs ?? DEFAULT_LOOKUP_TIMEOUT_MS;
    let timeout;
    let removeAbortListener;
    try {
        return await Promise.race([
            lookup(hostname, { all: true }),
            new Promise((_resolve, reject) => {
                timeout = setTimeout(() => reject(new Error('DNS lookup timed out')), timeoutMs);
                if (!options.signal)
                    return;
                if (options.signal.aborted) {
                    reject(new Error('DNS lookup aborted'));
                    return;
                }
                const abort = () => reject(new Error('DNS lookup aborted'));
                options.signal.addEventListener('abort', abort, { once: true });
                removeAbortListener = () => options.signal?.removeEventListener('abort', abort);
            }),
        ]);
    }
    finally {
        if (timeout)
            clearTimeout(timeout);
        removeAbortListener?.();
    }
}
export async function resolveHostAddresses(hostname, options = {}) {
    const normalized = normalizeHostname(hostname);
    const ipVersion = isIP(normalized);
    if (ipVersion === 4 || ipVersion === 6)
        return [{ address: normalized, family: ipVersion }];
    return await boundedLookup(normalized, options);
}
export async function isInternalHost(hostname, options = {}) {
    const normalized = normalizeHostname(hostname);
    if (isCommonInternalHostname(normalized))
        return true;
    if (isIP(normalized))
        return isInternalAddress(normalized);
    try {
        const addresses = await resolveHostAddresses(normalized, options);
        return addresses.some((entry) => isInternalAddress(entry.address));
    }
    catch {
        return true;
    }
}
//# sourceMappingURL=ip-guard.js.map