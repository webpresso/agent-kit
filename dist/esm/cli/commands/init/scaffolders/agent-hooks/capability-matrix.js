/**
 * Capability matrix — per-vendor, per-event hook support data.
 *
 * Documents what each agent CLI supports for each hook event, based on
 * official docs. Used by T13 (status), T14 (deny), and T22 (audit) to
 * explain gaps and emit correct per-vendor configurations.
 *
 * cursor column reflects the emitted Cursor hooks.json surface plus the
 * documented third-party compatibility caveats (opt-in compat, required
 * `version: 1`, and unmapped events: PermissionRequest and Notification
 * are NOT mapped in Cursor's third-party compatibility table).
 *
 * opencode column reflects the JS plugin API surface (opencode.ai/docs/plugins/):
 * - session.created / experimental.session.compacting → SessionStart context refresh (full)
 * - tool.execute.before / after → PreToolUse / PostToolUse (full)
 * - PermissionRequest is a degraded native callback; no managed permission hook is emitted
 * - experimental.session.compacting refreshes context; no managed PreCompact snapshot hook is emitted
 * - No UserPromptSubmit, Stop, SubagentStart/Stop, SessionEnd, PostCompact equivalent
 */
/**
 * Canonical capability matrix for all hook events across supported agent CLIs.
 *
 * claude/codex are Tier 1 CLIs (see supported-agent-clis.md).
 * cursor/opencode are Tier 2 CLIs — best-effort, documented degradations.
 */
export const CAPABILITY_MATRIX = [
    {
        event: 'SessionStart',
        claude: 'full',
        codex: 'full',
        cursor: 'full',
        opencode: 'full',
        notes: 'Cursor requires project hooks.json with version: 1; OpenCode bridges via session.created',
    },
    {
        event: 'PreToolUse',
        claude: 'full',
        codex: 'full',
        cursor: 'full',
        opencode: 'full',
        notes: 'OpenCode bridges via tool.execute.before; deny translates to throw new Error(...)',
    },
    {
        event: 'PostToolUse',
        claude: 'full',
        codex: 'full',
        cursor: 'full',
        opencode: 'full',
        notes: 'Cursor emits postToolUse; OpenCode bridges via tool.execute.after',
    },
    {
        event: 'PostToolUseFailure',
        claude: 'partial',
        codex: 'unsupported',
        cursor: 'unsupported',
        opencode: 'unsupported',
        notes: 'Claude documents this event, but the current managed wp-* surface does not emit a dedicated failure hook',
    },
    {
        event: 'UserPromptSubmit',
        claude: 'full',
        codex: 'full',
        cursor: 'partial',
        opencode: 'unsupported',
        notes: 'Cursor maps to beforeSubmitPrompt (third-party compat toggle required); OpenCode has no before-submit-prompt equivalent',
    },
    {
        event: 'Stop',
        claude: 'full',
        codex: 'full',
        cursor: 'full',
        opencode: 'unsupported',
        notes: 'Cursor emits stop; OpenCode has no turn-end/stop lifecycle event. Codex mandates JSON-only stdout for Stop (plain text is invalid)',
    },
    {
        event: 'PermissionRequest',
        claude: 'partial',
        codex: 'partial',
        cursor: 'unmapped',
        opencode: 'partial',
        notes: 'Cursor: not mapped in third-party compat table. OpenCode exposes native permission callbacks, but the managed plugin bridge emits no permission hook',
    },
    {
        event: 'SubagentStart',
        claude: 'partial',
        codex: 'partial',
        cursor: 'unsupported',
        opencode: 'unsupported',
        notes: 'Native-only event; current managed wp-* surface does not emit a dedicated subagent-start hook. Codex mandates JSON-only stdout for SubagentStop',
    },
    {
        event: 'SubagentStop',
        claude: 'partial',
        codex: 'partial',
        cursor: 'unsupported',
        opencode: 'unsupported',
        notes: 'Native-only event; current managed wp-* surface does not emit a dedicated subagent-stop hook. Codex mandates JSON-only stdout (plain text is invalid)',
    },
    {
        event: 'SessionEnd',
        claude: 'partial',
        codex: 'unsupported',
        cursor: 'unsupported',
        opencode: 'unsupported',
        notes: 'Claude documents this cleanup event, but the current managed wp-* surface does not emit a dedicated session-end hook',
    },
    {
        event: 'PreCompact',
        claude: 'full',
        codex: 'full',
        cursor: 'unsupported',
        opencode: 'partial',
        notes: 'Managed wp-precompact-snapshot is installed for Claude/Codex; Cursor has no PreCompact projection; its schema accepts host-native preCompact but the emitter intentionally omits it; OpenCode experimental.session.compacting refreshes SessionStart context and emits no wp-precompact-snapshot command',
    },
    {
        event: 'PostCompact',
        claude: 'partial',
        codex: 'partial',
        cursor: 'unsupported',
        opencode: 'unsupported',
        notes: 'Accepted in lifecycle tooling, but the current managed wp-* surface does not install a dedicated post-compact hook. OpenCode has no post-compaction event',
    },
];
export const REPLACEMENT_PARITY_CAPABILITY_CROSSWALK = [
    {
        capability: 'lifecycle capture',
        events: ['PostToolUse', 'UserPromptSubmit', 'Stop', 'PreCompact'],
        hosts: ['claude', 'codex', 'cursor', 'opencode'],
        notes: 'Host lifecycle capture is degraded until every covered host/event is full; store-only rows may remain scoped outside host parity.',
    },
    {
        capability: 'resume injection',
        events: ['SessionStart'],
        hosts: ['claude', 'codex', 'cursor', 'opencode'],
        notes: 'Resume injection enters host context through SessionStart-compatible surfaces.',
    },
    {
        capability: 'host setup smoke',
        events: [
            'SessionStart',
            'PreToolUse',
            'PostToolUse',
            'UserPromptSubmit',
            'Stop',
            'PreCompact',
        ],
        hosts: ['claude', 'codex', 'cursor', 'opencode'],
        notes: 'Setup smoke covers emitted lifecycle hooks and must reflect degraded host/event gaps.',
    },
];
function capabilityForEvent(event) {
    return CAPABILITY_MATRIX.find((entry) => entry.event === event);
}
function hostSupportFor(events, hosts) {
    return events.flatMap((event) => {
        const capability = capabilityForEvent(event);
        if (!capability)
            return ['unsupported'];
        return hosts.map((host) => capability[host]);
    });
}
export function replacementParitySupportCeiling(crosswalk) {
    const supportLevels = hostSupportFor(crosswalk.events, crosswalk.hosts);
    if (supportLevels.length === 0)
        return 'unsupported';
    if (supportLevels.every((level) => level === 'full'))
        return 'full';
    if (supportLevels.every((level) => level === 'unsupported' || level === 'unmapped')) {
        return 'unsupported';
    }
    return 'degraded';
}
function hostScopeCoversCrosswalkHosts(hostScope, hosts) {
    const normalized = hostScope.toLowerCase();
    return hosts.some((host) => normalized.includes(host));
}
export function validateReplacementParityCapabilityCrosswalk(rows, crosswalks = REPLACEMENT_PARITY_CAPABILITY_CROSSWALK) {
    const rowsByCapability = new Map(rows.map((row) => [row.capability.toLowerCase(), row]));
    const violations = [];
    for (const crosswalk of crosswalks) {
        const row = rowsByCapability.get(crosswalk.capability);
        if (!row)
            continue;
        if (row.status !== undefined && row.status !== 'passed')
            continue;
        if (!hostScopeCoversCrosswalkHosts(row.hostScope, crosswalk.hosts))
            continue;
        const ceiling = replacementParitySupportCeiling(crosswalk);
        if (row.supportLevel === 'full' && ceiling !== 'full') {
            violations.push({
                capability: row.capability,
                message: `Replacement parity row "${row.capability}" cannot claim full support because canonical host lifecycle support is ${ceiling}.`,
            });
        }
    }
    return violations;
}
//# sourceMappingURL=capability-matrix.js.map