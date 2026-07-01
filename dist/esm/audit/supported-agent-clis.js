import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { readTrustedJsonFile } from "#shared-utils/read-json-file.js";
/**
 * Audits that the prose rule doc `catalog/agent/rules/supported-agent-clis.md`
 * lists exactly the CLI identifiers the codebase actually models. This is the
 * gate both CLAUDE.md files already claim exists ("Adding a new CLI requires
 * updating the rule file (gated by `wp audit supported-agent-clis`)").
 *
 * Source of truth is CODE, never the prose doc: the doc is checked against the
 * typed unions, with the doc parsed narrowly for its one format-stable token.
 */
const RULE_DOC_REL = "catalog/agent/rules/supported-agent-clis.md";
const AGENT_KIT_PACKAGE = "@webpresso/agent-kit";
/**
 * Exhaustiveness lock binding the runtime CLI set to the code source of truth.
 *
 * The key type is the UNION of two distinct code lists, and the union is
 * load-bearing:
 *   - `AgentHostName`        — skill-projection hosts (claude, codex, opencode).
 *   - `CapabilityMatrixHost` — hook-capability vendors (claude, codex, cursor,
 *                              opencode).
 *
 * `cursor` is a host-agnostic copy target / hook vendor, not a skill-projection
 * host, so it appears in `CapabilityMatrixHost` but NOT `AgentHostName`. The
 * rule doc lists it as Tier 2, so the expected set must be the union. Do not
 * collapse this to `AgentHostName` alone — that would false-flag `cursor` as
 * doc-only drift. Because this is a `Record` keyed by the union, adding a CLI to
 * either union breaks this object literal at compile time until the new id is
 * added here (and, by extension, to the rule doc this audit checks).
 */
const CLI_ID_PRESENCE = {
    claude: true,
    codex: true,
    cursor: true,
    opencode: true,
};
export const EXPECTED_CLI_IDS = Object.keys(CLI_ID_PRESENCE);
// Matches the format-stable column-1 identifier token, e.g. `**Claude Code** (`claude`)`.
const COLUMN1_CLI_ID = /\(`([a-z][a-z0-9-]*)`\)/;
// Anchor on the first column only (`| CLI |`), so renaming later columns does
// not drop the table. Other columns may legitimately change wording.
const TABLE_HEADER = /^\|\s*CLI\s*\|/i;
const TABLE_SEPARATOR = /^\|[\s:|-]+\|\s*$/;
// Harvests column-1 ids from the data rows that follow a confirmed table, so
// backtick decoys in other columns (`/codex`, `-f json`, `opencode stats`) and
// stray prose are never picked up.
function harvestTableIds(lines, firstDataRow, ids) {
    for (let i = firstDataRow; i < lines.length; i++) {
        const row = lines[i] ?? "";
        if (!row.trimStart().startsWith("|"))
            return;
        const id = COLUMN1_CLI_ID.exec(row.split("|")[1] ?? "")?.[1];
        if (id)
            ids.add(id);
    }
}
/**
 * Extracts CLI identifiers from the rule doc's tables. A table is recognised
 * only by a `| CLI | … |` header immediately followed by a `|---|` separator
 * row, so a header-shaped line in prose (or a decoy table without a separator)
 * is not harvested. Parses ONLY column 1 of each data row.
 */
export function parseDocCliIds(markdown) {
    const ids = new Set();
    const lines = markdown.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
        if (TABLE_HEADER.test(lines[i] ?? "") && TABLE_SEPARATOR.test(lines[i + 1] ?? "")) {
            harvestTableIds(lines, i + 2, ids);
        }
    }
    return ids;
}
/**
 * Bidirectional set comparison. `code-has-not-in-doc` catches a shipped CLI
 * missing from the rule doc; `doc-has-not-in-code` catches a CLI the doc lists
 * that the code does not model.
 */
export function compareCliIds(docIds, expectedIds) {
    const violations = [];
    const expected = new Set(expectedIds);
    for (const id of expected) {
        if (!docIds.has(id)) {
            violations.push({
                file: RULE_DOC_REL,
                message: `code-has-not-in-doc: \`${id}\` is a supported CLI in code but is not listed in the rule doc.`,
            });
        }
    }
    for (const id of docIds) {
        if (!expected.has(id)) {
            violations.push({
                file: RULE_DOC_REL,
                message: `doc-has-not-in-code: \`${id}\` is listed in the rule doc but is not modeled in code (AgentHostName ∪ CapabilityMatrixHost).`,
            });
        }
    }
    return violations;
}
export function auditSupportedAgentClis(rootDirectory = process.cwd()) {
    const root = resolve(rootDirectory);
    const title = "Supported agent CLIs";
    const packageJson = readTrustedJsonFile(join(root, "package.json"));
    const isSelfHost = packageJson.name === AGENT_KIT_PACKAGE;
    const docPath = join(root, RULE_DOC_REL);
    if (!existsSync(docPath)) {
        // The rule doc is an agent-kit catalog asset; absent elsewhere it is simply
        // not applicable. In the agent-kit repo itself, its absence is a violation.
        if (isSelfHost) {
            return {
                ok: false,
                title,
                checked: 1,
                violations: [{ file: RULE_DOC_REL, message: `Rule doc ${RULE_DOC_REL} is missing.` }],
            };
        }
        return { ok: true, title, checked: 0, violations: [] };
    }
    const docIds = parseDocCliIds(readFileSync(docPath, "utf8"));
    const violations = compareCliIds(docIds, EXPECTED_CLI_IDS);
    return {
        ok: violations.length === 0,
        title,
        checked: EXPECTED_CLI_IDS.length + docIds.size,
        violations,
    };
}
//# sourceMappingURL=supported-agent-clis.js.map