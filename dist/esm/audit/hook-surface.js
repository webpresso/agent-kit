/**
 * `wp audit hook-surface` — enforces the single-rewriter-per-matcher invariant.
 *
 * From Anthropic's official hooks docs (May 2026):
 *   "When multiple PreToolUse hooks return updatedInput to rewrite a tool's
 *   arguments, the last one to finish wins. Since hooks run in parallel, the
 *   order is non-deterministic. Avoid having more than one hook modify the
 *   same tool's input."
 *
 * This audit collects hooks from:
 *   - ~/.claude/settings.json          (user-level)
 *   - $CLAUDE_PROJECT_DIR/.claude/settings.json  (project-level)
 *
 * It classifies each hook as a **rewriter** or a **validator**, then flags any
 * event+matcher combination that has more than one rewriter registered.
 *
 * Known rewriters (hardcoded, expandable):
 *   - `rtk hook claude` → Bash rewriter
 *   - any hook path ending in `pretooluse.mjs`
 */
import { existsSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
// ---------------------------------------------------------------------------
// Owner extraction
// ---------------------------------------------------------------------------
/**
 * Determines the canonical owner of a hook command using priority-ordered
 * pattern matching. Returns one of: 'webpresso', 'omx',
 * 'rtk', or 'unknown'.
 */
export function extractOwner(command) {
    if (/\bwp[-_][a-z]/.test(command))
        return "webpresso";
    if (/omx|oh-my-codex/.test(command))
        return "omx";
    if (/\brtk\b/.test(command))
        return "rtk";
    return "unknown";
}
// ---------------------------------------------------------------------------
// Drift detection
// ---------------------------------------------------------------------------
/**
 * Detects drift violations where the same owner+command appears more than once
 * for the same runtime+event combination. Cross-owner same-event composition
 * is NOT a violation — only same-owner/same-command duplication is.
 *
 * Pure function — no filesystem I/O.
 */
export function detectDrift(entries) {
    const byKey = new Map();
    for (const entry of entries) {
        const owner = extractOwner(entry.command);
        const key = `${entry.runtime}:${entry.event}:${owner}:${entry.command.trim()}`;
        const existing = byKey.get(key);
        if (existing) {
            existing.push(entry);
        }
        else {
            byKey.set(key, [entry]);
        }
    }
    const violations = [];
    for (const [key, group] of byKey) {
        if (group.length > 1) {
            violations.push({ key, count: group.length, entries: group });
        }
    }
    return violations;
}
// ---------------------------------------------------------------------------
// Rewriter detection
// ---------------------------------------------------------------------------
/**
 * Returns true if the hook command is a known rewriter — i.e. it can return
 * `updatedInput` and mutate the tool's arguments.
 *
 * Validators only return `permissionDecision` or `additionalContext` and are
 * safe to stack on the same matcher.
 */
function isRewriter(command) {
    // RTK rewrites Bash input — canonical rewriter
    if (command.includes("rtk hook claude"))
        return true;
    // PreToolUse script hooks can rewrite input. We cannot read the hook's
    // internals here, so we flag any pretooluse.mjs binding conservatively.
    if (command.endsWith("pretooluse.mjs"))
        return true;
    if (command.includes("/pretooluse.mjs"))
        return true;
    return false;
}
// ---------------------------------------------------------------------------
// Settings file parsing
// ---------------------------------------------------------------------------
function readSettingsFile(filePath) {
    if (!existsSync(filePath)) {
        return { source: filePath, hooks: {} };
    }
    let raw;
    try {
        raw = readFileSync(filePath, "utf8");
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
            source: filePath,
            hooks: {},
            parseError: `Could not read ${filePath}: ${msg}`,
        };
    }
    let parsed;
    try {
        parsed = JSON.parse(raw);
    }
    catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        return {
            source: filePath,
            hooks: {},
            parseError: `Could not parse ${filePath}: ${msg}`,
        };
    }
    if (!parsed || typeof parsed !== "object") {
        return { source: filePath, hooks: {} };
    }
    const record = parsed;
    // Claude Code settings.json wraps hooks under { "hooks": { Event: [...] } }
    const raw_hooks = record["hooks"];
    if (raw_hooks && typeof raw_hooks === "object" && !Array.isArray(raw_hooks)) {
        return { source: filePath, hooks: raw_hooks };
    }
    return { source: filePath, hooks: {} };
}
function resolveSettingsPaths(projectDir, userSettingsOverride) {
    const paths = [];
    // User-level: ~/.claude/settings.json (or override for tests)
    const userSettings = userSettingsOverride ?? path.join(os.homedir(), ".claude", "settings.json");
    paths.push(userSettings);
    // Project-level: $CLAUDE_PROJECT_DIR/.claude/settings.json
    const projectRoot = projectDir ?? process.env["CLAUDE_PROJECT_DIR"];
    if (projectRoot) {
        paths.push(path.join(projectRoot, ".claude", "settings.json"));
    }
    return paths;
}
function collectRewriters(settings) {
    const entries = [];
    for (const { source, hooks } of settings) {
        for (const [event, groups] of Object.entries(hooks)) {
            if (!Array.isArray(groups))
                continue;
            for (const group of groups) {
                const matcher = group.matcher ?? "*";
                const hookEntries = group.hooks ?? [];
                for (const hook of hookEntries) {
                    const command = hook.command;
                    if (typeof command !== "string" || command.trim() === "")
                        continue;
                    if (isRewriter(command)) {
                        entries.push({ event, matcher, command, source });
                    }
                }
            }
        }
    }
    return entries;
}
function buildViolations(rewriters) {
    // Group by event+matcher
    const byKey = new Map();
    for (const entry of rewriters) {
        const key = `${entry.event}\0${entry.matcher}`;
        const existing = byKey.get(key);
        if (existing) {
            existing.push(entry);
        }
        else {
            byKey.set(key, [entry]);
        }
    }
    const violations = [];
    for (const [key, entries] of byKey) {
        if (entries.length <= 1)
            continue;
        const [event, matcher] = key.split("\0");
        const commands = entries.map((e) => e.command);
        violations.push({
            event,
            matcher,
            rewriters: commands,
            reason: `${entries.length} rewriters registered on ${event}/${matcher}: ` +
                commands.map((c) => JSON.stringify(c)).join(", ") +
                ". Since hooks run in parallel, the last updatedInput wins non-deterministically. " +
                "Keep at most one rewriter per event+matcher combination.",
        });
    }
    return violations;
}
/**
 * Run the hook-surface audit.
 */
export function auditHookSurface(projectDirOrOpts) {
    const opts = typeof projectDirOrOpts === "string"
        ? { projectDir: projectDirOrOpts }
        : (projectDirOrOpts ?? {});
    const settingsPaths = resolveSettingsPaths(opts.projectDir, opts.userSettingsPath);
    const settings = settingsPaths.map(readSettingsFile);
    const parseErrors = settings.flatMap((s) => (s.parseError ? [s.parseError] : []));
    const rewriters = collectRewriters(settings);
    const violations = buildViolations(rewriters);
    const passed = violations.length === 0 && parseErrors.length === 0;
    // Promote parse errors to violations so they surface in the output
    const errorViolations = parseErrors.map((msg) => ({
        event: "parse-error",
        matcher: "",
        rewriters: [],
        reason: msg,
    }));
    const allViolations = [...errorViolations, ...violations];
    return {
        passed,
        kind: "hook-surface",
        details: {
            ok: passed,
            violations: allViolations,
        },
    };
}
/**
 * Adapter returning a RepoAuditResult shape for registry integration.
 */
export function auditHookSurfaceAsRepoResult(projectDirOrOpts) {
    const result = auditHookSurface(projectDirOrOpts);
    const violations = result.details.violations.map((v) => ({
        message: v.reason,
    }));
    return {
        ok: result.passed,
        title: "Hook surface audit",
        checked: result.details.violations.length,
        violations,
    };
}
//# sourceMappingURL=hook-surface.js.map