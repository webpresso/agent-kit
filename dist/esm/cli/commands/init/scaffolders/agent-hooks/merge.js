/**
 * Hook group merge utilities — deduplication and merge logic for HooksMap.
 *
 * Extracted from index.ts to allow emitters and other consumers to import
 * merge logic without pulling in the full scaffolder surface.
 */
function findHookIndexByCommand(hooks, command) {
    return hooks.findIndex((hook) => commandMatches(hook.command, command));
}
const SCRIPT_EXTENSIONS = ["sh", "ts", "js", "mjs", "cjs", "py"];
const SCRIPT_BASENAME_PATTERN = new RegExp(String.raw `([\w-]+\.(?:${SCRIPT_EXTENSIONS.join("|")}))(?=$|["'\s])`, "u");
function extractAgentKitBinName(command) {
    const match = /\bwp["']?\s+hook\s+([a-z0-9-]+)/u.exec(command);
    return match?.[1] ? `wp-${match[1]}` : null;
}
/**
 * Return a stable identifier for the script that `command` invokes, or null
 * when none can be extracted (e.g. an opaque shell expression). Used by
 * `commandMatches` for dedup across wrapped/raw invocation forms.
 */
function extractCommandTarget(command) {
    const binName = extractAgentKitBinName(command);
    if (binName !== null)
        return `bin:${binName}`;
    const scriptMatch = SCRIPT_BASENAME_PATTERN.exec(command);
    if (scriptMatch !== null)
        return `script:${scriptMatch[1]}`;
    return null;
}
/**
 * Detect whether two commands invoke the same target, regardless of
 * materialized shell details (for direct `wp hook <name>` commands) or
 * script path noise for user-owned scripts.
 */
function commandMatches(left, right) {
    if (left === right)
        return true;
    const leftTarget = extractCommandTarget(left);
    return leftTarget !== null && extractCommandTarget(right) === leftTarget;
}
/**
 * Ensure `group` is present in `groups`. If a group already contains a hook
 * with the same direct hook command target, update its metadata (matcher,
 * timeout) but preserve the consumer's materialized command form. If no
 * matching hook is found, append the group.
 */
export function ensureGroup(groups, group) {
    const incomingHook = group.hooks[0];
    if (!incomingHook)
        return groups;
    let changed = false;
    const nextGroups = groups.map((existingGroup) => {
        const hookIndex = findHookIndexByCommand(existingGroup.hooks, incomingHook.command);
        if (hookIndex === -1)
            return existingGroup;
        changed = true;
        const hooks = existingGroup.hooks.map((hook, index) => index === hookIndex
            ? {
                ...hook,
                ...incomingHook,
                // Preserve the consumer's already-materialized command form when
                // only the matcher/timeout changed. Codex command path migration is
                // handled by normalizeCodexAgentKitCommands before this merge.
                command: hook.command,
            }
            : hook);
        return {
            ...existingGroup,
            ...(group.matcher !== undefined ? { matcher: group.matcher } : {}),
            hooks,
        };
    });
    if (changed)
        return nextGroups;
    return [...groups, group];
}
/**
 * Merge `addition` hook groups into `existing`, deduplicating via
 * `ensureGroup`. Returns a new HooksMap; does not mutate inputs.
 */
export function mergeAgentKitGroups(existing, addition) {
    const result = { ...existing };
    for (const [event, groups] of Object.entries(addition)) {
        let target = result[event] ?? [];
        for (const group of groups) {
            target = ensureGroup(target, group);
        }
        result[event] = target;
    }
    return result;
}
//# sourceMappingURL=merge.js.map