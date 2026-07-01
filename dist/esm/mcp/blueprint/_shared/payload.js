export const bytes = (s) => Buffer.byteLength(s, "utf8");
export const toStr = (e) => (e instanceof Error ? e.message : String(e));
export function sortKeys(value) {
    if (Array.isArray(value))
        return value.map(sortKeys);
    if (value !== null && typeof value === "object") {
        const entries = Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0);
        const out = {};
        for (const [key, nested] of entries)
            out[key] = sortKeys(nested);
        return out;
    }
    return value;
}
//# sourceMappingURL=payload.js.map