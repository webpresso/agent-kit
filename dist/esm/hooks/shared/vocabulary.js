/**
 * Status vocabulary for hook status reporting. Only the states that
 * `specStatus` (status/index.ts) actually produces are represented here; add a
 * term when a producer for it lands, not before.
 */
export const HOOK_STATUS = {
    installed: 'installed',
    enforcing: 'enforcing', // guard-class hook actively denying
    disabled: 'disabled', // explicitly disabled
};
const COL_WIDTHS = {
    event: 20,
    hook: 28,
    vendor: 8,
    status: 20,
};
function padRight(value, width) {
    return value.length >= width ? value : value + ' '.repeat(width - value.length);
}
/**
 * Format a HookStatusDetail for terminal output (one line).
 *
 * Example:
 *   PreToolUse           wp-pretool-guard             claude    enforcing
 *   SessionStart         wp-sessionstart-routing      codex     disabled       → run: wp setup
 */
export function formatStatusLine(detail) {
    const parts = [
        padRight(detail.event, COL_WIDTHS.event),
        padRight(detail.hook, COL_WIDTHS.hook),
        padRight(detail.vendor, COL_WIDTHS.vendor),
        padRight(detail.status, COL_WIDTHS.status),
    ];
    const suffix = [];
    if (detail.reason)
        suffix.push(`reason: ${detail.reason}`);
    if (detail.nextCommand)
        suffix.push(`→ run: ${detail.nextCommand}`);
    const line = parts.join('  ').trimEnd();
    return suffix.length > 0 ? `${line}  ${suffix.join('  ')}` : line;
}
//# sourceMappingURL=vocabulary.js.map