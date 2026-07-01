import { mkdirSync, renameSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { readTrustedJsonFile } from "#shared-utils/read-json-file.js";
import { writeJsonFile } from "#shared-utils/write-json-file.js";
import { resolveManagedWorktreeRoot } from "./location.js";
function registryPath(root = resolveManagedWorktreeRoot()) {
    return join(root, "registry.json");
}
function emptyRegistry() {
    return { version: 1, entries: [] };
}
export function readWorktreeRegistry(options = {}) {
    const path = registryPath(options.root);
    if (!existsSync(path))
        return emptyRegistry();
    try {
        const parsed = readTrustedJsonFile(path);
        if (parsed.version !== 1 || !Array.isArray(parsed.entries))
            return emptyRegistry();
        return {
            version: 1,
            entries: parsed.entries.filter(isRegistryEntry),
        };
    }
    catch {
        return emptyRegistry();
    }
}
function isRegistryEntry(value) {
    if (!value || typeof value !== "object")
        return false;
    const entry = value;
    return (typeof entry.id === "string" &&
        typeof entry.repoNamespace === "string" &&
        typeof entry.repoRoot === "string" &&
        (entry.kind === "owner" || entry.kind === "scratch") &&
        typeof entry.path === "string" &&
        typeof entry.createdAt === "string" &&
        typeof entry.updatedAt === "string");
}
export function writeWorktreeRegistry(registry, options = {}) {
    const path = registryPath(options.root);
    mkdirSync(dirname(path), { recursive: true });
    const tmpPath = `${path}.${process.pid}.${Date.now()}.tmp`;
    writeJsonFile(tmpPath, registry);
    renameSync(tmpPath, path);
}
export function upsertWorktreeRegistryEntry(entry, options = {}) {
    const now = options.now?.() ?? new Date().toISOString();
    const registry = readWorktreeRegistry(options);
    const existing = registry.entries.find((candidate) => candidate.id === entry.id);
    const next = {
        ...entry,
        createdAt: entry.createdAt ?? existing?.createdAt ?? now,
        updatedAt: entry.updatedAt ?? now,
    };
    writeWorktreeRegistry({
        version: 1,
        entries: [
            ...registry.entries.filter((candidate) => candidate.id !== entry.id),
            next,
        ].toSorted((a, b) => a.path.localeCompare(b.path)),
    }, options);
    return next;
}
export function removeWorktreeRegistryEntries(predicate, options = {}) {
    const registry = readWorktreeRegistry(options);
    const removed = registry.entries.filter(predicate);
    if (removed.length === 0)
        return [];
    writeWorktreeRegistry({ version: 1, entries: registry.entries.filter((entry) => !predicate(entry)) }, options);
    return removed;
}
export function pruneStaleWorktreeRegistryEntries(options = {}) {
    const registry = readWorktreeRegistry(options);
    const shouldPrune = (entry) => !existsSync(entry.path) && (options.predicate?.(entry) ?? true);
    const kept = registry.entries.filter((entry) => !shouldPrune(entry));
    const removed = registry.entries.filter(shouldPrune);
    if (removed.length > 0)
        writeWorktreeRegistry({ version: 1, entries: kept }, options);
    return { kept, removed };
}
export function findWorktreeRegistryEntry(id, options = {}) {
    return readWorktreeRegistry(options).entries.find((entry) => entry.id === id) ?? null;
}
//# sourceMappingURL=registry.js.map