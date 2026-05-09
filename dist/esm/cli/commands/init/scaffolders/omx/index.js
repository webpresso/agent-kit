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
        stdio: 'inherit',
    });
    if (result.status !== 0) {
        return { kind: 'omx-spawn-failed', exitCode: result.status ?? -1 };
    }
    migrateDeprecatedCodexHooksFeatureFlagInConfig(input.configPath ?? defaultCodexConfigPath());
    return { kind: 'omx-ok', installed };
}
//# sourceMappingURL=index.js.map