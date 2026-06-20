/**
 * Webpresso-owned curated gstack-derived skill installer.
 *
 * V1 no longer clones or pulls the upstream checkout. It copies allowlisted,
 * provenance-backed Markdown skill sources shipped with @webpresso/agent-kit
 * into user skill roots. Removing an old external checkout is explicit only.
 */
import { existsSync, mkdirSync, cpSync, renameSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import { resolveAgentKitPackageRoot } from '#cli/commands/init/package-root';
import { auditGstackSkillCollisions, WEBPRESSO_GSTACK_SKILLS } from './collision-audit.js';
function defaultExternalCheckoutRoot() {
    return path.join(process.env.HOME || homedir(), '.claude', 'skills', 'gstack');
}
function defaultClaudeSkillsRoot() {
    return path.join(process.env.HOME || homedir(), '.claude', 'skills');
}
function defaultCodexConfigPath() {
    return path.join(process.env.HOME || homedir(), '.codex', 'config.toml');
}
function defaultCodexSkillsRoot() {
    return path.join(process.env.HOME || homedir(), '.codex', 'skills');
}
function defaultDetectCodex(input) {
    return input.exists(input.codexConfigPath);
}
function resolveCatalogSkillsRoot(packageRoot) {
    const root = packageRoot ?? resolveAgentKitPackageRoot({ moduleUrl: import.meta.url });
    return root ? path.join(root, 'catalog', 'agent', 'skills') : null;
}
function defaultExternalBackupRoot(externalRoot) {
    const externalParent = path.dirname(externalRoot);
    const ownerRoot = path.dirname(externalParent);
    if (path.basename(externalParent) === 'skills') {
        return path.join(ownerRoot, 'skills-backup');
    }
    return path.join(externalParent, '.gstack-backups');
}
function hasInstalledWebpressoSkills(root, exists) {
    return WEBPRESSO_GSTACK_SKILLS.every((name) => exists(path.join(root, name, 'SKILL.md')));
}
function installSkills(input) {
    const hadAll = hasInstalledWebpressoSkills(input.targetRoot, input.exists);
    input.mkdir(input.targetRoot, { recursive: true });
    for (const name of WEBPRESSO_GSTACK_SKILLS) {
        const source = path.join(input.sourceRoot, name, 'SKILL.md');
        if (!input.exists(source))
            throw new Error(`missing staged skill asset: ${source}`);
        const targetDir = path.join(input.targetRoot, name);
        input.mkdir(targetDir, { recursive: true });
        input.cp(source, path.join(targetDir, 'SKILL.md'), { force: true });
    }
    return hadAll ? 'updated' : 'installed';
}
export function cleanupExternalGstackCheckout(input) {
    const exists = input.exists ?? existsSync;
    if (!exists(input.externalRoot))
        return { kind: 'skipped-not-present', path: input.externalRoot };
    if (!input.explicit)
        return { kind: 'refused', path: input.externalRoot };
    if (input.dryRun)
        return { kind: 'dry-run', path: input.externalRoot };
    const mkdir = input.mkdir ?? mkdirSync;
    const rename = input.rename ?? renameSync;
    const stamp = new Date(input.now?.() ?? Date.now()).toISOString().replaceAll(':', '-').replaceAll('.', '-');
    const backupRoot = input.backupRoot ?? defaultExternalBackupRoot(input.externalRoot);
    const backupPath = path.join(backupRoot, `${path.basename(input.externalRoot)}.backup-${stamp}`);
    mkdir(backupRoot, { recursive: true });
    rename(input.externalRoot, backupPath);
    return { kind: 'backed-up', path: input.externalRoot, backupPath };
}
export async function ensureGstack(input) {
    if (input.options.dryRun)
        return { kind: 'gstack-skipped-dry-run' };
    const exists = input.exists ?? existsSync;
    const mkdir = input.mkdir ?? mkdirSync;
    const cp = input.cp ?? cpSync;
    const env = input.env ?? process.env;
    const log = input.log ?? console.log;
    const claudeSkillsRoot = input.claudeSkillsRoot ?? defaultClaudeSkillsRoot();
    const codexSkillsRoot = input.codexSkillsRoot ?? defaultCodexSkillsRoot();
    const codexConfigPath = input.codexConfigPath ?? defaultCodexConfigPath();
    const externalRoot = input.installRoot ?? defaultExternalCheckoutRoot();
    const sourceRoot = resolveCatalogSkillsRoot(input.packageRoot);
    if (!sourceRoot || !exists(sourceRoot)) {
        return { kind: 'gstack-setup-failed', command: 'webpresso-skill-install', exitCode: 1, reason: 'missing-package-assets', logPath: sourceRoot ?? 'unresolved-package-root' };
    }
    const codexDetected = (input.detectCodex ?? defaultDetectCodex)({ exists, codexConfigPath });
    const collisions = auditGstackSkillCollisions({ claudeSkillsRoot, codexSkillsRoot, exists, readFile: input.readFile });
    if (collisions.length > 0) {
        return { kind: 'gstack-setup-failed', command: 'webpresso-skill-install', exitCode: 1, reason: 'collision', logPath: 'skill-collision-audit', collisions };
    }
    const claudeState = installSkills({ sourceRoot, targetRoot: claudeSkillsRoot, mkdir, cp, exists });
    const codexState = codexDetected
        ? installSkills({ sourceRoot, targetRoot: codexSkillsRoot, mkdir, cp, exists })
        : null;
    const cleanup = cleanupExternalGstackCheckout({
        externalRoot,
        dryRun: false,
        explicit: env.WP_GSTACK_CLEANUP_EXTERNAL === '1',
        exists,
        mkdir,
        rename: input.rename,
        now: input.now,
    });
    if (cleanup.kind === 'refused') {
        log(`  gstack: external checkout left in place at ${cleanup.path}; set WP_GSTACK_CLEANUP_EXTERNAL=1 to back it up and retire it.`);
    }
    else if (cleanup.kind === 'backed-up') {
        log(`  gstack: external checkout backed up to ${cleanup.backupPath}`);
    }
    const codex = codexDetected
        ? codexState === 'updated'
            ? { kind: 'gstack-codex-updated', skillsRoot: codexSkillsRoot }
            : { kind: 'gstack-codex-installed', skillsRoot: codexSkillsRoot }
        : { kind: 'gstack-codex-skipped', reason: 'not-detected', skillsRoot: codexSkillsRoot };
    return claudeState === 'updated'
        ? { kind: 'gstack-updated', root: claudeSkillsRoot, codex }
        : { kind: 'gstack-installed', root: claudeSkillsRoot, codex };
}
//# sourceMappingURL=index.js.map