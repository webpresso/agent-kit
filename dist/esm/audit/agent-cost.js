import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
function hasFilesWithExtension(root, ext) {
    try {
        const out = execSync(`find . \\( -path ./node_modules -o -path ./.git -o -path ./dist -o -path ./build \\) -prune -o -name "*.${ext}" -print -quit`, { cwd: root, encoding: "utf-8", timeout: 3000, stdio: ["pipe", "pipe", "ignore"] });
        return out.trim().length > 0;
    }
    catch {
        return false;
    }
}
function readJson(path) {
    if (!existsSync(path))
        return null;
    try {
        const parsed = JSON.parse(readFileSync(path, "utf-8"));
        return parsed !== null && typeof parsed === "object"
            ? parsed
            : null;
    }
    catch {
        return null;
    }
}
function isLspDisabled(pluginKey) {
    // Check user-global settings first, then fall back to false (assume not disabled).
    const homeDir = process.env["HOME"] ?? process.env["USERPROFILE"] ?? "";
    const globalSettings = homeDir ? readJson(join(homeDir, ".claude", "settings.json")) : null;
    const plugins = globalSettings?.["enabledPlugins"];
    if (plugins !== null && typeof plugins === "object") {
        const pluginsMap = plugins;
        const fullKey = `${pluginKey}@claude-plugins-official`;
        if (fullKey in pluginsMap)
            return pluginsMap[fullKey] === false;
    }
    return false;
}
export async function auditAgentCost(cwd) {
    const violations = [];
    let checked = 0;
    // ─── Check 1: .claudeignore present ───────────────────────────────────────
    checked++;
    if (!existsSync(join(cwd, ".claudeignore"))) {
        violations.push({
            file: ".claudeignore",
            message: "Missing .claudeignore — Claude Code will traverse node_modules, dist, and build " +
                "artifacts during autonomous exploration. Create .claudeignore (gitignore syntax) " +
                "with node_modules/, .webpresso/, .wrangler/, packages/*/dist/ etc. " +
                "Measure local impact with wp gain before making numeric savings claims.",
        });
    }
    // ─── Check 2: effortLevel in project .claude/settings.json ────────────────
    checked++;
    const settings = readJson(join(cwd, ".claude", "settings.json"));
    if (settings === null) {
        violations.push({
            file: ".claude/settings.json",
            message: '.claude/settings.json not found. Consider creating it with "effortLevel": "medium" ' +
                "to cap thinking token spend for this project. " +
                'The global ~/.claude/settings.json default may be "xhigh" (max thinking tokens). ' +
                "Override per-session with /effort high when planning.",
        });
    }
    else if (!("effortLevel" in settings)) {
        violations.push({
            file: ".claude/settings.json",
            message: "effortLevel not set in project settings — inherits from ~/.claude/settings.json. " +
                'If the global setting is "xhigh", every request in this project runs max thinking tokens. ' +
                'Add "effortLevel": "medium" here to scope the budget. Override with /effort high per-session.',
        });
    }
    // ─── Check 3: LSP plugins for languages absent from the repo ──────────────
    const lspChecks = [
        { plugin: "rust-analyzer-lsp", ext: "rs", lang: "Rust" },
        { plugin: "gopls-lsp", ext: "go", lang: "Go" },
    ];
    for (const { plugin, ext, lang } of lspChecks) {
        checked++;
        if (!hasFilesWithExtension(cwd, ext) && !isLspDisabled(plugin)) {
            violations.push({
                message: `No .${ext} (${lang}) files found — ${plugin} is likely unused. ` +
                    `Disable it in ~/.claude/settings.json: "${plugin}@claude-plugins-official": false. ` +
                    `LSP tool schemas inject into every session system prompt (~1–3K tokens each).`,
            });
        }
    }
    // ─── Check 4: .ignore present (OpenCode / ripgrep) ───────────────────────
    // OpenCode uses ripgrep and respects .gitignore automatically for build
    // artifacts. But tracked directories (e.g. blueprints/completed/) need
    // a separate .ignore (ripgrep-native) to be excluded from agent sessions.
    checked++;
    if (!existsSync(join(cwd, ".ignore"))) {
        violations.push({
            file: ".ignore",
            message: "Missing .ignore — OpenCode uses ripgrep and respects .gitignore for build artifacts, " +
                "but tracked directories (e.g. webpresso/blueprints/completed/) are still traversed. " +
                "Create .ignore with any large tracked dirs to exclude from agent sessions. " +
                "Does not affect git. See: opencode.ai/docs/tools/#ignore-patterns",
        });
    }
    // Advisory audit — violations are warnings, not blocking errors.
    // Cost config is a recommendation, not a hard correctness gate.
    return {
        ok: true,
        title: "agent cost config",
        checked,
        violations,
    };
}
//# sourceMappingURL=agent-cost.js.map