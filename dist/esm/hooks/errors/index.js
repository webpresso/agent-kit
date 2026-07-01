import { randomUUID } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { getSurfacePath, NotInGitRepoError } from "#paths/state-root.js";
export const HOOK_FALLBACK_ACTIONS = ["fail-closed-deny", "emit-empty-json", "fail-open"];
const DEFAULT_LIMIT = 10;
const MAX_ERROR_ENTRIES = 50;
const MAX_DETAIL_CHARS = 500;
let recorderWarningEmitted = false;
function parsePositiveInt(value, fallback) {
    if (value === undefined)
        return fallback;
    const parsed = Number.parseInt(value, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
function truncateDetail(value) {
    if (!value)
        return undefined;
    const normalized = value.replace(/\s+/gu, " ").trim();
    if (normalized.length <= MAX_DETAIL_CHARS)
        return normalized;
    return `${normalized.slice(0, MAX_DETAIL_CHARS)}…`;
}
function warnRecorderFailure(error) {
    if (recorderWarningEmitted)
        return;
    recorderWarningEmitted = true;
    const detail = error instanceof Error ? error.message : String(error ?? "");
    process.stderr.write(`webpresso hook error recorder unavailable: ${detail}\n`);
}
export function resolveHookErrorsPath(cwd = process.cwd()) {
    if (process.env.WP_HOOK_ERRORS_PATH)
        return process.env.WP_HOOK_ERRORS_PATH;
    try {
        return getSurfacePath("hook-errors.json", "repo", cwd);
    }
    catch (error) {
        if (!(error instanceof NotInGitRepoError))
            throw error;
        return getSurfacePath("hook-errors.json", "user");
    }
}
export function readHookErrors(cwd = process.cwd()) {
    const indexPath = resolveHookErrorsPath(cwd);
    if (!existsSync(indexPath))
        return [];
    try {
        const parsed = JSON.parse(readFileSync(indexPath, "utf8"));
        return Array.isArray(parsed.entries) ? parsed.entries : [];
    }
    catch {
        return [];
    }
}
function writeHookErrorIndex(indexPath, entries) {
    mkdirSync(dirname(indexPath), { recursive: true });
    const tmpPath = `${indexPath}.${process.pid}.${Date.now()}.${randomUUID()}.tmp`;
    try {
        writeFileSync(tmpPath, `${JSON.stringify({ version: 1, entries: entries.slice(0, MAX_ERROR_ENTRIES) }, null, 2)}\n`, "utf8");
        renameSync(tmpPath, indexPath);
    }
    catch (error) {
        rmSync(tmpPath, { force: true });
        throw error;
    }
}
export function recordHookError(input, cwd = process.cwd()) {
    try {
        const indexPath = resolveHookErrorsPath(cwd);
        const entries = readHookErrors(cwd);
        const entry = {
            timestamp: new Date().toISOString(),
            binName: input.binName,
            hookName: input.hookName,
            event: input.event,
            phase: input.phase,
            fallback: input.fallback,
            ...(input.status === undefined ? {} : { status: input.status }),
            ...(input.signal === undefined ? {} : { signal: input.signal }),
            ...(input.detail === undefined ? {} : { detail: truncateDetail(input.detail) }),
        };
        writeHookErrorIndex(indexPath, [entry, ...entries]);
    }
    catch (error) {
        warnRecorderFailure(error);
    }
}
function formatStatus(entry) {
    if (entry.signal)
        return `signal=${entry.signal}`;
    if (entry.status !== undefined)
        return `status=${entry.status}`;
    return "status=unknown";
}
export function formatHookErrors(entries, limit = DEFAULT_LIMIT) {
    const shown = entries.slice(0, limit);
    if (shown.length === 0) {
        return "wp hooks errors: no managed hook errors recorded for this repo\n";
    }
    const lines = [`wp hooks errors — showing ${shown.length} recent managed hook degradation(s)`];
    for (const entry of shown) {
        const detail = entry.detail ? ` — ${entry.detail}` : "";
        lines.push(`- ${entry.timestamp} ${entry.binName} (${entry.event}/${entry.hookName}) ${entry.phase} ${formatStatus(entry)} fallback=${entry.fallback}${detail}`);
    }
    return `${lines.join("\n")}\n`;
}
export async function hooksErrorsCommand(args = [], stdout = process.stdout, options = {}) {
    const json = options.json === true || args.includes("--json");
    const limitFlagIndex = args.indexOf("--limit");
    const limit = options.limit ?? parsePositiveInt(args[limitFlagIndex + 1], DEFAULT_LIMIT);
    const entries = readHookErrors(options.cwd).slice(0, limit);
    if (json) {
        stdout.write(`${JSON.stringify({ version: 1, entries }, null, 2)}\n`);
        return;
    }
    stdout.write(formatHookErrors(entries, limit));
}
//# sourceMappingURL=index.js.map