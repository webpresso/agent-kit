/**
 * Generates a markdown capability matrix table from CAPABILITY_MATRIX.
 *
 * Reads the canonical hook event x vendor support grid from ir.ts and
 * formats it as a markdown table with symbol-prefixed support levels.
 */
import { CAPABILITY_MATRIX } from "#cli/commands/init/scaffolders/agent-hooks/capability-matrix.js";
const SYMBOL = {
    full: "✅ full",
    partial: "⚠️ partial",
    unsupported: "❌ unsupported",
    unmapped: "❌ unmapped",
};
const FOOTER = [
    "",
    "*unmapped: event exists in vendor but is not mapped through Cursor's third-party compatibility layer*",
    "*unsupported: vendor does not support this event*",
    "*Source: catalog/agent/rules/supported-agent-clis.md*",
].join("\n");
export function generateCapabilityMatrix() {
    const header = "## Hook Capability Matrix\n";
    const tableHeader = "| Event | Claude Code | Codex CLI | Cursor | OpenCode |";
    const tableSeparator = "|---|---|---|---|---|";
    const rows = CAPABILITY_MATRIX.map((cap) => `| ${cap.event} | ${SYMBOL[cap.claude]} | ${SYMBOL[cap.codex]} | ${SYMBOL[cap.cursor]} | ${SYMBOL[cap.opencode]} |`);
    return [header, tableHeader, tableSeparator, ...rows, FOOTER].join("\n");
}
//# sourceMappingURL=generate-capability-matrix.js.map