import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { readConfig } from '#cli/commands/init/config';
const REQUIRED_HOOKS = [
    { event: 'SessionStart', bin: 'ak-sessionstart-routing' },
    { event: 'PreToolUse', bin: 'ak-pretool-guard' },
    { event: 'PostToolUse', bin: 'ak-post-tool' },
    { event: 'UserPromptSubmit', bin: 'ak-guard-switch' },
    { event: 'Stop', bin: 'ak-stop-qa' },
];
const CLAUDE_SETTINGS_PATH = '.claude/settings.json';
const CODEX_HOOKS_PATH = '.codex/hooks.json';
const REQUIRED_SUBAGENTS = [
    'code-reviewer.md',
    'security-auditor.md',
    'doc-writer.md',
    'explorer.md',
];
export function auditAgents(rootDirectory = process.cwd()) {
    const root = resolve(rootDirectory);
    const violations = [];
    let checked = 0;
    const packageJson = readJsonFile(join(root, 'package.json'));
    const packageName = typeof packageJson.name === 'string' ? packageJson.name : undefined;
    const isSelfHost = packageName === '@webpresso/agent-kit';
    const config = readConfig(root);
    checked += 1;
    checkNonEmptyFile(root, 'AGENTS.md', violations, 'AGENTS.md is required at repo root and must be non-empty.');
    if (isSelfHost) {
        // .codex/hooks.json is gitignored (.codex/* in .gitignore) — it is written
        // at runtime by Codex CLI and never present in a fresh CI checkout. Skip
        // the Codex hook check for the source repo itself; consumer repos (the
        // else branch) still check it because they commit their hooks.json.
        checked += 1;
        checkClaudeRules(root, config?.rules.overrides ?? [], violations);
        checked += 1;
        checkClaudeAgents(root, violations);
    }
    else {
        checked += 1;
        checkHookFile(root, CLAUDE_SETTINGS_PATH, 'claude', violations);
        checked += 1;
        checkClaudeWorktree(root, violations);
        checked += 1;
        checkHookFile(root, CODEX_HOOKS_PATH, 'codex', violations);
        checked += 1;
        checkClaudeRules(root, config?.rules.overrides ?? [], violations);
        checked += 1;
        checkClaudeAgents(root, violations);
        checked += 1;
        checkSetupAgentScript(root, packageJson, config?.scripts['setup-agent'], violations);
        if (!config?.globalInstall) {
            checked += 1;
            checkAgentKitDevDependency(root, packageJson, violations);
        }
    }
    return {
        ok: violations.length === 0,
        title: 'Agent surfaces',
        checked,
        violations,
    };
}
function checkClaudeAgents(root, violations) {
    const agentsTarget = join(root, '.claude', 'agents');
    if (!existsSync(agentsTarget)) {
        violations.push({
            file: '.claude/agents',
            message: 'Missing .claude/agents directory — run `ak setup` to scaffold canonical subagents.',
        });
        return;
    }
    for (const file of REQUIRED_SUBAGENTS) {
        const targetPath = join(agentsTarget, file);
        if (!existsSync(targetPath)) {
            violations.push({
                file: relative(root, targetPath),
                message: `Missing Claude subagent ${file}. Run \`ak setup\` to re-sync canonical subagents.`,
            });
            continue;
        }
        const stat = lstatSync(targetPath);
        if (!stat.isSymbolicLink()) {
            violations.push({
                file: relative(root, targetPath),
                message: `Canonical subagent ${file} must remain a symlink to catalog/agent/agents/${file}.`,
            });
            continue;
        }
        const linkTarget = readlinkSync(targetPath).replace(/\\/gu, '/');
        const resolvedTarget = resolve(dirname(targetPath), linkTarget);
        const expectedSuffix = `/catalog/agent/agents/${file}`;
        const looksLikeCanonicalTarget = linkTarget.endsWith(expectedSuffix) || basename(resolvedTarget) === file;
        if (!looksLikeCanonicalTarget) {
            violations.push({
                file: relative(root, targetPath),
                message: `Canonical subagent ${file} points to ${JSON.stringify(linkTarget)} instead of a recognized catalog target.`,
            });
            continue;
        }
        if (!existsSync(resolvedTarget)) {
            violations.push({
                file: relative(root, targetPath),
                message: `Canonical subagent ${file} symlink is dangling. Run \`ak setup\` to repair it.`,
            });
        }
    }
}
function checkNonEmptyFile(root, relativePath, violations, message) {
    const filePath = join(root, relativePath);
    if (!existsSync(filePath)) {
        violations.push({ file: relativePath, message });
        return;
    }
    const content = readFileSync(filePath, 'utf8').trim();
    if (content.length === 0) {
        violations.push({ file: relativePath, message });
    }
}
function checkHookFile(root, relativePath, host, violations) {
    const filePath = join(root, relativePath);
    if (!existsSync(filePath)) {
        violations.push({
            file: relativePath,
            message: host === 'claude'
                ? 'Missing .claude/settings.json — run `ak setup` to scaffold Claude hooks.'
                : 'Missing .codex/hooks.json — run `ak setup` to scaffold Codex hooks.',
        });
        return;
    }
    const hooks = parseHooks(readFileSync(filePath, 'utf8'), host);
    for (const requirement of REQUIRED_HOOKS) {
        const groups = hooks[requirement.event] ?? [];
        const found = groups.some((group) => (group.hooks ?? []).some((hook) => hook.command?.includes(requirement.bin)));
        if (!found) {
            violations.push({
                file: relativePath,
                message: `Missing ${requirement.event} hook for ${requirement.bin}. Re-run \`ak setup\` to repair agent hooks.`,
            });
        }
    }
}
function checkClaudeWorktree(root, violations) {
    const settingsPath = join(root, CLAUDE_SETTINGS_PATH);
    if (!existsSync(settingsPath))
        return;
    const parsed = readJsonFile(settingsPath);
    const worktree = parsed.worktree;
    const symlinkDirectories = Array.isArray(worktree?.symlinkDirectories)
        ? worktree?.symlinkDirectories
        : [];
    if (!symlinkDirectories.includes('.claude')) {
        violations.push({
            file: CLAUDE_SETTINGS_PATH,
            message: 'worktree.symlinkDirectories must include `.claude` so worktrees inherit agent surfaces.',
        });
    }
}
function checkClaudeRules(root, overrides, violations) {
    const rulesSource = join(root, '.agent', 'rules');
    const rulesTarget = join(root, '.claude', 'rules');
    const overrideSet = new Set(overrides);
    if (!existsSync(rulesSource)) {
        violations.push({
            file: '.agent/rules',
            message: 'Missing .agent/rules source directory.',
        });
        return;
    }
    if (!existsSync(rulesTarget)) {
        violations.push({
            file: '.claude/rules',
            message: 'Missing .claude/rules directory — run `ak setup` to scaffold rule symlinks.',
        });
        return;
    }
    const sourceEntries = readdirSync(rulesSource).filter((file) => file.endsWith('.md') && file !== 'README.md' && file !== '.markdownlint.json');
    const targetEntries = new Set(readdirSync(rulesTarget).filter((file) => file.endsWith('.md')));
    for (const file of sourceEntries) {
        const ruleName = file.replace(/\.md$/u, '');
        const targetPath = join(rulesTarget, file);
        const isOverride = overrideSet.has(ruleName);
        if (!existsSync(targetPath)) {
            violations.push({
                file: relative(root, targetPath),
                message: isOverride
                    ? `Allowlisted override ${ruleName} is missing its .claude/rules entry.`
                    : `Missing Claude rule link for ${ruleName}. Run \`ak setup\` to re-sync.`,
            });
            continue;
        }
        const stat = lstatSync(targetPath);
        if (isOverride) {
            if (stat.isSymbolicLink()) {
                violations.push({
                    file: relative(root, targetPath),
                    message: `Rule ${ruleName} is allowlisted as an override but is still a symlink. Replace it with consumer-owned content or remove the override.`,
                });
            }
            continue;
        }
        if (!stat.isSymbolicLink()) {
            violations.push({
                file: relative(root, targetPath),
                message: `Rule ${ruleName} is a real file but not allowlisted in .agent-kitrc.json#rules.overrides.`,
            });
            continue;
        }
        const linkTarget = readlinkSync(targetPath).replace(/\\/gu, '/');
        const resolvedTarget = resolve(dirname(targetPath), linkTarget);
        const expectedLegacy = join('..', '..', '.agent', 'rules', file).replace(/\\/gu, '/');
        const looksLikeDirectRuleTarget = linkTarget.endsWith(`/catalog/agent/rules/${file}`) ||
            linkTarget.endsWith(`/.agent/rules/${file}`) ||
            basename(resolvedTarget) === file;
        if (linkTarget !== expectedLegacy && !looksLikeDirectRuleTarget) {
            violations.push({
                file: relative(root, targetPath),
                message: `Rule ${ruleName} points to ${JSON.stringify(linkTarget)} instead of a recognized rule target.`,
            });
            continue;
        }
        if (!existsSync(resolvedTarget)) {
            violations.push({
                file: relative(root, targetPath),
                message: `Rule ${ruleName} symlink is dangling. Run \`ak setup\` to repair it.`,
            });
        }
    }
    for (const file of targetEntries) {
        const ruleName = file.replace(/\.md$/u, '');
        if (sourceEntries.includes(file))
            continue;
        if (overrideSet.has(ruleName))
            continue;
        violations.push({
            file: relative(root, join(rulesTarget, file)),
            message: `Unexpected Claude rule ${file}. Remove it or add ${ruleName} to .agent-kitrc.json#rules.overrides.`,
        });
    }
}
function checkSetupAgentScript(root, packageJson, overrideCommand, violations) {
    const scripts = (packageJson.scripts ?? {});
    const actual = typeof scripts['setup:agent'] === 'string' ? scripts['setup:agent'] : undefined;
    const expected = overrideCommand ?? 'ak setup';
    if (actual !== expected) {
        violations.push({
            file: 'package.json',
            message: actual === undefined
                ? `Missing scripts.setup:agent. Expected ${JSON.stringify(expected)}.`
                : `scripts.setup:agent must be ${JSON.stringify(expected)} (got ${JSON.stringify(actual)}).`,
        });
    }
}
function checkAgentKitDevDependency(root, packageJson, violations) {
    const devDependencies = (packageJson.devDependencies ?? {});
    const version = devDependencies['@webpresso/agent-kit'];
    const scripts = (packageJson.scripts ?? {});
    const setupAgent = typeof scripts['setup:agent'] === 'string' ? scripts['setup:agent'] : '';
    const postinstall = typeof scripts.postinstall === 'string' ? scripts.postinstall : '';
    const usesGlobalAkConsumerMode = setupAgent === 'ak setup' && postinstall.includes('run-agent-kit-bin.ts restore-dev-links');
    if (usesGlobalAkConsumerMode) {
        return;
    }
    if (typeof version !== 'string' || version.trim().length === 0) {
        violations.push({
            file: 'package.json',
            message: 'Missing devDependency `@webpresso/agent-kit`. Run `vp install -D @webpresso/agent-kit` then `vp install`.',
        });
    }
}
function parseHooks(raw, host) {
    const parsed = readJsonContent(raw);
    if (!parsed || typeof parsed !== 'object')
        return {};
    // Both Claude and Codex use the wrapped form `{ "hooks": { Event: [...] } }`
    // per their canonical docs (https://developers.openai.com/codex/hooks).
    // The agent-hooks scaffolder writes wrapped via `hoistTopLevelEvents`; the
    // audit must read it the same way or it will report false negatives.
    // For Codex, fall back to the parsed root if `hooks` is absent so legacy
    // pre-migration flat-form files still audit cleanly.
    const hooks = parsed.hooks;
    if (hooks && typeof hooks === 'object')
        return hooks;
    return host === 'codex' ? parsed : {};
}
function readJsonFile(path) {
    return JSON.parse(readFileSync(path, 'utf8'));
}
function readJsonContent(source) {
    return JSON.parse(source);
}
//# sourceMappingURL=agents.js.map