/**
 * `gstack` scaffolder preset.
 *
 * gstack uses a canonical checkout installed at `~/.claude/skills/gstack/`.
 * Agent-kit owns that checkout bootstrap, then lets gstack's own host-aware
 * setup command materialize additional surfaces such as Codex from the same
 * checkout.
 *
 * Detection for the canonical checkout is path-based, NOT PATH-based: gstack
 * itself is not a CLI binary on $PATH. Checkout bootstrap is a clone +
 * `./setup --team`. When Codex is detected, agent-kit runs gstack's official
 * `./setup --host auto --team` flow from that same checkout so one setup pass
 * can refresh both Claude/team mode and Codex materialization.
 *
 * Side-effect outside the consumer repo: writes to the user's home dir.
 * This is intentional — gstack is global by design.
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { makeNoopSpinnerFactory } from '#cli/commands/init/scaffolders/spinner';
const GSTACK_REPO = 'https://github.com/garrytan/gstack.git';
function defaultInstallRoot() {
    return path.join(process.env.HOME || homedir(), '.claude', 'skills', 'gstack');
}
function defaultCodexConfigPath() {
    return path.join(process.env.HOME || homedir(), '.codex', 'config.toml');
}
function defaultCodexSkillsRoot() {
    return path.join(process.env.HOME || homedir(), '.codex', 'skills');
}
function formatSetupCommand(args) {
    return args[0] === '--team' ? '--team' : '--host auto --team';
}
function runSetup(root, spawn, args) {
    const result = spawn('./setup', args, { cwd: root, stdio: 'inherit' });
    return { ok: result.status === 0, exitCode: result.status ?? -1, command: formatSetupCommand(args) };
}
function defaultDetectCodex(input) {
    if (input.exists(input.codexConfigPath))
        return true;
    const probe = input.spawn('codex', ['--version'], { stdio: 'ignore' });
    return probe.status === 0;
}
function ensureCodexHost(input) {
    const codexDetected = input.detectCodex({
        spawn: input.spawn,
        exists: input.exists,
        codexConfigPath: input.codexConfigPath,
    });
    if (!codexDetected) {
        return {
            kind: 'gstack-codex-skipped',
            reason: 'not-detected',
            skillsRoot: input.codexSkillsRoot,
        };
    }
    const hadSkills = input.exists(path.join(input.codexSkillsRoot, 'gstack'));
    input.spinner.start();
    const setup = runSetup(input.root, input.spawn, ['--host', 'auto', '--team']);
    if (!setup.ok) {
        input.spinner.fail('gstack codex setup failed');
        return { kind: 'gstack-setup-failed', exitCode: setup.exitCode, command: setup.command };
    }
    input.spinner.succeed(hadSkills ? 'gstack codex updated' : 'gstack codex installed');
    return hadSkills
        ? { kind: 'gstack-codex-updated', skillsRoot: input.codexSkillsRoot }
        : { kind: 'gstack-codex-installed', skillsRoot: input.codexSkillsRoot };
}
/**
 * Ensure gstack is installed and up-to-date.
 * - Not present: clone from main + setup.
 * - Already present: pull latest main + re-run setup.
 * - If Codex is detected: materialize Codex skills from the canonical checkout.
 */
export function ensureGstack(input) {
    if (input.options.dryRun)
        return { kind: 'gstack-skipped-dry-run' };
    const spawn = input.spawn ?? spawnSync;
    const exists = input.exists ?? existsSync;
    const detectCodex = input.detectCodex ?? defaultDetectCodex;
    const root = input.installRoot ?? defaultInstallRoot();
    const codexConfigPath = input.codexConfigPath ?? defaultCodexConfigPath();
    const codexSkillsRoot = input.codexSkillsRoot ?? defaultCodexSkillsRoot();
    const spinner = (input.spinnerFactory ?? makeNoopSpinnerFactory())('gstack');
    const hasSetup = exists(path.join(root, 'setup'));
    const hasGitDir = exists(path.join(root, '.git'));
    if (hasSetup) {
        if (hasGitDir) {
            spinner.start();
            const pull = spawn('git', ['pull', '--ff-only', 'origin', 'main'], {
                cwd: root,
                stdio: 'inherit',
            });
            if (pull.status !== 0) {
                spinner.fail('gstack pull failed');
                return { kind: 'gstack-pull-failed', exitCode: pull.status ?? -1 };
            }
        }
        spinner.start();
        const codex = ensureCodexHost({
            root,
            spawn,
            exists,
            detectCodex,
            codexConfigPath,
            codexSkillsRoot,
            spinner,
        });
        if (codex.kind === 'gstack-setup-failed')
            return codex;
        if (codex.kind === 'gstack-codex-skipped') {
            const setup = runSetup(root, spawn, ['--team']);
            if (!setup.ok) {
                spinner.fail('gstack setup failed');
                return { kind: 'gstack-setup-failed', exitCode: setup.exitCode, command: setup.command };
            }
        }
        spinner.succeed('gstack updated');
        return { kind: 'gstack-updated', root, codex };
    }
    spinner.start();
    const clone = spawn('git', ['clone', '--depth', '1', GSTACK_REPO, root], {
        stdio: 'inherit',
    });
    if (clone.status !== 0) {
        spinner.fail('gstack clone failed');
        return { kind: 'gstack-clone-failed', exitCode: clone.status ?? -1 };
    }
    const codex = ensureCodexHost({
        root,
        spawn,
        exists,
        detectCodex,
        codexConfigPath,
        codexSkillsRoot,
        spinner,
    });
    if (codex.kind === 'gstack-setup-failed')
        return codex;
    if (codex.kind === 'gstack-codex-skipped') {
        const setup = runSetup(root, spawn, ['--team']);
        if (!setup.ok) {
            spinner.fail('gstack setup failed');
            return { kind: 'gstack-setup-failed', exitCode: setup.exitCode, command: setup.command };
        }
    }
    spinner.succeed('gstack installed');
    return { kind: 'gstack-installed', root, codex };
}
//# sourceMappingURL=index.js.map