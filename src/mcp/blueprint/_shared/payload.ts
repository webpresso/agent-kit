export const bytes = (s: string) => Buffer.byteLength(s, 'utf8')

export const toStr = (e: unknown) => (e instanceof Error ? e.message : String(e))

export function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) =>
      a < b ? -1 : a > b ? 1 : 0,
    )
    const out: Record<string, unknown> = {}
    for (const [key, nested] of entries) out[key] = sortKeys(nested)
    return out
  }
  return value
}
