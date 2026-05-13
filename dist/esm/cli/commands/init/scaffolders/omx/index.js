/**
 * `omx` scaffolder preset.
 *
 * Ensures `omx` is installed, then chains `omx setup --yes` after the
 * agent-kit scaffold completes. OMX (oh-my-codex) is the operator-workflow
 * execution layer; it manages its own scaffolding idempotently.
 *
 * Required when downstream features rely on `omx team` (see
 * `cli/commands/blueprint/execution.ts`).
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
const NOT_FOUND_HINT = 'omx (oh-my-codex) is not on PATH after `npm install -g oh-my-codex`. Install it manually and re-run.';
function defaultCodexConfigPath() {
    const codexHome = process.env.CODEX_HOME || join(process.env.HOME || homedir(), '.codex');
    return join(codexHome, 'config.toml');
}
/** Matches any `[hooks.state."<key>"]` TOML section header written by OMX. */
const HOOK_STATE_SECTION_RE = /^\[hooks\.state\.".+"\]$/;
/**
 * Removes ALL hook trust state blocks when duplicate `[hooks.state."..."]` keys
 * are detected.
 *
 * The TOML spec forbids duplicate keys; Codex CLI rejects the config outright.
 * Older OMX versions wrote blocks terminated by `# End OMX-owned Codex hook
 * trust state` but without a leading start marker. OMX's own
 * `stripManagedCodexHookTrustState` only strips START→END bounded blocks, so
 * legacy entries accumulate on every `ak setup` run.
 *
 * Detection contract: count unique vs total `[hooks.state."..."]` section
 * headers. If any key appears more than once the file is TOML-invalid. When
 * duplicates exist we strip all hook trust content (entries + OMX block marker
 * comments) so `omx setup --yes` can rewrite exactly one clean managed block.
 */
export function deduplicateCodexHookTrustState(config) {
    const allKeys = [...config.matchAll(/^\[hooks\.state\.".+"\]$/gm)].map((m) => m[0]);
    if (allKeys.length === new Set(allKeys).size)
        return config;
    const lines = config.split(/\r?\n/);
    const kept = [];
    let i = 0;
    while (i < lines.length) {
        const trimmed = lines[i].trim();
        if (HOOK_STATE_SECTION_RE.test(trimmed)) {
            i += 1;
            if (i < lines.length && /^trusted_hash\s*=/.test(lines[i]?.trim() ?? '')) {
                i += 1;
            }
            continue;
        }
        // Strip OMX block-marker comment lines by prefix — resilient to minor wording changes.
        if (trimmed.startsWith('# OMX-owned Codex hook trust state') ||
            trimmed.startsWith('# End OMX-owned Codex hook trust state') ||
            trimmed === '# Trusts only setup-managed codex-native-hook.js wrappers.') {
            i += 1;
            continue;
        }
        kept.push(lines[i]);
        i += 1;
    }
    return (kept
        .join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trimEnd() + '\n');
}
export function migrateDeprecatedCodexHooksFeatureFlag(raw) {
    const lines = raw.split(/\r?\n/);
    const featuresStart = lines.findIndex((line) => /^\s*\[features\]\s*$/.test(line));
    if (featuresStart < 0)
        return raw;
    let sectionEnd = lines.length;
    for (let i = featuresStart + 1; i < lines.length; i += 1) {
        if (/^\s*\[\[?[^\]]+\]?\]\s*$/.test(lines[i])) {
            sectionEnd = i;
            break;
        }
    }
    let hooksIdx = -1;
    let codexHooksIdx = -1;
    let codexHooksValue = 'true';
    let codexHooksIndent = '';
    for (let i = featuresStart + 1; i < sectionEnd; i += 1) {
        const line = lines[i];
        if (/^\s*hooks\s*=/.test(line)) {
            hooksIdx = i;
            continue;
        }
        const match = line.match(/^(\s*)codex_hooks\s*=\s*(.+)$/);
        if (!match)
            continue;
        codexHooksIdx = i;
        codexHooksIndent = match[1] ?? '';
        codexHooksValue = match[2] ?? 'true';
    }
    if (codexHooksIdx < 0)
        return raw;
    const replacement = `${codexHooksIndent}hooks = ${codexHooksValue}`;
    if (hooksIdx >= 0) {
        const nextLines = [...lines];
        nextLines[hooksIdx] = replacement;
        return nextLines
            .filter((line, idx) => idx === hooksIdx || !/^\s*codex_hooks\s*=/.test(line))
            .join('\n');
    }
    return lines
        .flatMap((line, idx) => {
        if (idx === codexHooksIdx)
            return [replacement];
        if (/^\s*codex_hooks\s*=/.test(line))
            return [];
        return [line];
    })
        .join('\n');
}
function migrateDeprecatedCodexHooksFeatureFlagInConfig(configPath) {
    if (!existsSync(configPath))
        return;
    const existing = readFileSync(configPath, 'utf8');
    const next = migrateDeprecatedCodexHooksFeatureFlag(existing);
    if (next === existing)
        return;
    mkdirSync(dirname(configPath), { recursive: true });
    writeFileSync(configPath, next, 'utf8');
}
/**
 * Ensure `omx` is on PATH then run `omx setup --yes` in the consumer repo.
 * Idempotent: safe to run on every `ak setup`.
 */
export function ensureOmx(input) {
    if (input.options.dryRun)
        return { kind: 'omx-skipped-dry-run' };
    const spawn = input.spawn ?? spawnSync;
    const configPath = input.configPath ?? defaultCodexConfigPath();
    // Pre-repair: remove legacy duplicate hook trust blocks before omx setup runs.
    if (existsSync(configPath)) {
        const existing = readFileSync(configPath, 'utf8');
        const repaired = deduplicateCodexHookTrustState(existing);
        if (repaired !== existing) {
            mkdirSync(dirname(configPath), { recursive: true });
            writeFileSync(configPath, repaired, 'utf8');
        }
    }
    let installed = false;
    let probe = spawn('omx', ['--version'], { encoding: 'utf8' });
    if (probe.error || (probe.status !== null && probe.status !== 0)) {
        const install = spawn('npm', ['install', '-g', 'oh-my-codex'], { stdio: 'inherit' });
        if (install.status !== 0) {
            return { kind: 'omx-not-found', hint: NOT_FOUND_HINT };
        }
        installed = true;
        probe = spawn('omx', ['--version'], { encoding: 'utf8' });
        if (probe.error || (probe.status !== null && probe.status !== 0)) {
            return { kind: 'omx-not-found', hint: NOT_FOUND_HINT };
        }
    }
    const result = spawn('omx', ['setup', '--yes'], {
        cwd: input.repoRoot,
        stdio: ['ignore', 'inherit', 'inherit'],
    });
    if (result.status !== 0) {
        return { kind: 'omx-spawn-failed', exitCode: result.status ?? -1 };
    }
    migrateDeprecatedCodexHooksFeatureFlagInConfig(configPath);
    return { kind: 'omx-ok', installed };
}
//# sourceMappingURL=index.js.map