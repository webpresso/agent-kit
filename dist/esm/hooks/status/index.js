/**
 * `wp hooks status` command — derives and prints per-vendor hook status.
 *
 * Reads the installed hooks file for each vendor, compares against
 * WP_HOOK_SPECS, and prints an aligned status table.
 */
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { formatStatusLine, HOOK_STATUS, } from '#hooks/shared/vocabulary.js';
import { readHooksManifest, } from '#cli/commands/init/scaffolders/agent-hooks/manifest.js';
import { WP_HOOK_SPECS as IR_HOOK_SPECS } from '#cli/commands/init/scaffolders/agent-hooks/ir.js';
// Hooks that actively deny tool calls when present (guard-class).
const GUARD_BINS = new Set(['wp-pretool-guard']);
/**
 * Derived from the IR's WP_HOOK_SPECS — the single source of truth for
 * hook bin names, events, and timeouts. `isGuard` is a status-display
 * concern derived here rather than duplicated in ir.ts.
 */
export const WP_HOOK_SPECS = IR_HOOK_SPECS.map((spec) => ({
    hook: spec.bin,
    event: spec.event,
    isGuard: GUARD_BINS.has(spec.bin),
}));
// ── Status derivation ─────────────────────────────────────────────────────────
function hookAppearsInMap(hooksMap, hookName) {
    for (const groups of Object.values(hooksMap)) {
        for (const group of groups) {
            for (const entry of group.hooks) {
                if (entry.command.includes(hookName))
                    return true;
            }
        }
    }
    return false;
}
function specStatus(spec, present, manifestExists) {
    if (!manifestExists)
        return HOOK_STATUS.disabled;
    if (!present)
        return HOOK_STATUS.disabled;
    return spec.isGuard ? HOOK_STATUS.enforcing : HOOK_STATUS.installed;
}
/**
 * Pure logic: derive status for all hooks for a given vendor from the
 * installed hooks file. Returns one HookStatusDetail per hook spec entry.
 *
 * Sort order: event name then hook name.
 */
export function deriveHookStatus(options) {
    const { hooksMap, vendor, manifestExists, vendorState = 'enabled' } = options;
    const details = WP_HOOK_SPECS.map((spec) => {
        const present = hookAppearsInMap(hooksMap, spec.hook);
        return {
            hook: spec.hook,
            event: spec.event,
            vendor,
            status: vendorState === 'disabled'
                ? HOOK_STATUS.disabled
                : specStatus(spec, present, manifestExists),
        };
    });
    return [...details].sort((a, b) => {
        const eventOrder = a.event.localeCompare(b.event);
        return eventOrder !== 0 ? eventOrder : a.hook.localeCompare(b.hook);
    });
}
// ── File readers ──────────────────────────────────────────────────────────────
function readHooksMap(filePath) {
    if (!existsSync(filePath))
        return {};
    try {
        const raw = readFileSync(filePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed))
            return {};
        const obj = parsed;
        // Codex wraps events under a top-level `hooks` key.
        const candidate = typeof obj['hooks'] === 'object' && obj['hooks'] !== null && !Array.isArray(obj['hooks'])
            ? obj['hooks']
            : obj;
        // Flatten to HooksMap: keep only array-valued event keys.
        const result = {};
        for (const [key, value] of Object.entries(candidate)) {
            if (Array.isArray(value))
                result[key] = value;
        }
        return result;
    }
    catch {
        return {};
    }
}
function resolveClaudeSettingsPath(repoRoot) {
    return join(repoRoot, '.claude', 'settings.json');
}
function resolveCodexHooksPath(repoRoot) {
    return join(repoRoot, '.codex', 'hooks.json');
}
// ── Command entry point ───────────────────────────────────────────────────────
function parseVendorFlag(argv) {
    const idx = argv.indexOf('--vendor');
    if (idx === -1 || idx + 1 >= argv.length)
        return ['claude', 'codex'];
    const value = argv[idx + 1];
    if (value === 'claude' || value === 'codex')
        return [value];
    return ['claude', 'codex'];
}
function resolveRepoRoot() {
    return process.env['CLAUDE_PROJECT_DIR'] ?? process.cwd();
}
function hooksFilePath(vendor, repoRoot) {
    return vendor === 'claude' ? resolveClaudeSettingsPath(repoRoot) : resolveCodexHooksPath(repoRoot);
}
function printVendorStatus(vendor, repoRoot, manifestExists, vendorState) {
    const filePath = hooksFilePath(vendor, repoRoot);
    const hooksMap = readHooksMap(filePath);
    const details = deriveHookStatus({ hooksMap, vendor, manifestExists, vendorState });
    process.stdout.write(`\n[${vendor}] hooks status (${filePath})\n`);
    process.stdout.write(`${'─'.repeat(80)}\n`);
    for (const detail of details) {
        process.stdout.write(`${formatStatusLine(detail)}\n`);
    }
}
/**
 * Entry point called from src/cli/commands/hooks.ts case 'status':
 *
 *   case 'status':
 *     await import('#hooks/status/index.js').then(m => m.statusCommand(rest))
 */
export async function statusCommand(argv) {
    const vendors = parseVendorFlag(argv);
    const repoRoot = resolveRepoRoot();
    const manifest = readHooksManifest(repoRoot);
    const manifestExists = manifest !== null;
    if (!manifestExists) {
        process.stdout.write('No hooks manifest found. Run `wp setup` to regenerate managed hook state.\n');
    }
    for (const vendor of vendors) {
        printVendorStatus(vendor, repoRoot, manifestExists, manifest?.vendorState[vendor] ?? 'enabled');
    }
}
//# sourceMappingURL=index.js.map