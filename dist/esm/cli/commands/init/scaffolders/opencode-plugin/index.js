import { join } from "node:path";
import { buildOpencodeHookPluginContent } from "#cli/commands/init/scaffolders/agent-hooks/emitters/opencode.js";
import { writeFileMerged } from "#cli/commands/init/merge";
/**
 * Installs the generated OpenCode plugin bridge under `.opencode/plugins/`.
 *
 * OpenCode auto-loads local JS/TS plugins, so this scaffolder owns the
 * generated file and refreshes it on every `wp setup`.
 */
export const OPENCODE_PLUGIN_RELATIVE_PATH = ".opencode/plugins/webpresso-hooks.js";
export const OPENCODE_PLUGIN_SUPPORT_LEVEL = "degraded";
export const OPENCODE_PLUGIN_CONTENT = buildOpencodeHookPluginContent();
export function scaffoldOpencodePlugin(input) {
    const targetPath = join(input.repoRoot, OPENCODE_PLUGIN_RELATIVE_PATH);
    return writeFileMerged(targetPath, OPENCODE_PLUGIN_CONTENT, {
        ...input.options,
        ownership: "generated-whole-file",
    });
}
//# sourceMappingURL=index.js.map