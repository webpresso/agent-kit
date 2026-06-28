/**
 * Scaffold `agent-rules/` — consumer-owned canonical rules directory whose
 * contents are projected into the various AI surfaces (`.agent/rules/`,
 * `.cursor/rules/`, etc.) by the symlink/sync layer. Source-of-truth lives in
 * `agent-rules/` and is committed; the projected surfaces are gitignored.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { renderInstructionSurface } from "#hooks/shared/instruction-surfaces";
import { patchGitignore } from "./gitignore-patcher.js";
import { writeFileMerged } from "./merge.js";
const AGENT_RULES_README = `# agent-rules/

This directory holds consumer-owned **agent rules** — the canonical source
of behavioural guidelines that get projected into per-tool surfaces
\`wp sync\`.

## Authoring

- Add a new rule with \`wp rule new <slug>\`.
- Each rule is a markdown file with frontmatter (\`title\`, \`scope\`).
- Edit files here — never the projected copies under \`.agent/\` etc.

## Lifecycle

- Files in \`agent-rules/\` are committed.
- Projected surfaces (\`.agent/rules/\`, \`.cursor/rules/\`, …) are gitignored.
- Run \`wp sync\` after editing to refresh derived surfaces.
`;
export const WEBPRESSO_ROUTING_RULE_FILENAME = "webpresso-routing.md";
const RULE_IGNORE_PATTERNS = [".agent/rules/", ".cursor/rules/", ".claude/rules/"];
export function scaffoldAgentRules(opts) {
    const { cwd, dryRun, overwrite } = opts;
    const mergeOpts = { dryRun, overwrite };
    const dir = join(cwd, "agent-rules");
    const gitkeep = join(dir, ".gitkeep");
    const results = [];
    const gitkeepExisted = existsSync(gitkeep);
    if (!dryRun) {
        if (!existsSync(dir))
            mkdirSync(dir, { recursive: true });
        if (!gitkeepExisted)
            writeFileSync(gitkeep, "");
    }
    results.push({
        targetPath: gitkeep,
        action: gitkeepExisted ? "identical" : dryRun ? "skipped-dry" : "created",
    });
    results.push(writeFileMerged(join(dir, "README.md"), AGENT_RULES_README, mergeOpts));
    results.push(writeFileMerged(join(dir, WEBPRESSO_ROUTING_RULE_FILENAME), renderInstructionSurface({ host: "cursor" }).content + "\n", mergeOpts));
    results.push(patchGitignore(join(cwd, ".gitignore"), { id: "rule-sync", patterns: [...RULE_IGNORE_PATTERNS] }, mergeOpts));
    return { results };
}
//# sourceMappingURL=scaffold-agent-rules.js.map