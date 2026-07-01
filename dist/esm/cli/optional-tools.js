import { claimProjectOwnedTool, claimUserOwnedTool, clearProjectOwnedTool, clearUserOwnedTool, isProjectOwnedTool, isUserOwnedTool, } from "#cli/tooling-ownership.js";
import { appendGlobalCapableVpArgs } from "#cli/global-vp.js";
import { OMC_MARKETPLACE, OMC_PLUGIN_ID } from "#cli/commands/init/scaffolders/omc/index.js";
function vpStep(vpCommand, id, args) {
    const command = appendGlobalCapableVpArgs(vpCommand, args);
    return { id, command: command[0], args: command.slice(1), optional: true };
}
function packageAdapter(input) {
    return {
        id: input.id,
        namespace: "base",
        canonicalName: input.canonicalName,
        aliases: input.aliases ?? [],
        supportedScopes: ["user"],
        ownershipName: input.ownershipName,
        install: ({ vpCommand }) => [vpStep(vpCommand, input.id, ["install", "-g", input.packageName])],
        update: ({ ownershipState, vpCommand }) => isUserOwnedTool(ownershipState, input.id)
            ? [vpStep(vpCommand, input.id, ["update", "-g", input.packageName])]
            : [],
    };
}
export const OPTIONAL_TOOL_ADAPTERS = [
    packageAdapter({
        id: "codex",
        canonicalName: "codex",
        packageName: "@openai/codex",
        ownershipName: "OpenAI Codex CLI",
    }),
    packageAdapter({
        id: "claude-code",
        canonicalName: "claude-code",
        packageName: "@anthropic-ai/claude-code",
        ownershipName: "Claude Code CLI",
        aliases: ["claude"],
    }),
    packageAdapter({
        id: "opencode",
        canonicalName: "opencode",
        packageName: "opencode-ai",
        ownershipName: "OpenCode CLI",
    }),
    {
        id: "omx",
        namespace: "oh-my",
        canonicalName: "codex",
        aliases: ["omx", "oh-my-codex"],
        supportedScopes: ["user", "project"],
        ownershipName: "Oh My Codex",
        install: ({ vpCommand, scope, cwd }) => [
            vpStep(vpCommand, "omx", ["install", "-g", "oh-my-codex"]),
            { id: "omx-setup", command: "omx", args: ["setup", "--yes", "--scope", scope], cwd },
        ],
        update: ({ ownershipState, repoKey, vpCommand }) => isUserOwnedTool(ownershipState, "omx") || isProjectOwnedTool(ownershipState, "omx", repoKey)
            ? [vpStep(vpCommand, "omx", ["update", "-g", "oh-my-codex"])]
            : [],
    },
    {
        id: "omc",
        namespace: "oh-my",
        canonicalName: "claude-code",
        aliases: ["omc", "oh-my-claudecode", "oh-my-claude-code"],
        supportedScopes: ["user", "project"],
        ownershipName: "Oh My ClaudeCode",
        install: ({ scope }) => [
            {
                id: "omc-marketplace",
                command: "claude",
                args: ["plugin", "marketplace", "add", "--scope", scope, OMC_MARKETPLACE],
            },
            {
                id: "omc",
                command: "claude",
                args: ["plugin", "install", "--scope", scope, OMC_PLUGIN_ID],
            },
        ],
        update: ({ ownershipState, repoKey, cwd }) => {
            const steps = [];
            if (isUserOwnedTool(ownershipState, "omc")) {
                steps.push({
                    id: "omc",
                    optional: true,
                    command: "claude",
                    args: ["plugin", "update", "--scope", "user", OMC_PLUGIN_ID],
                });
            }
            if (isProjectOwnedTool(ownershipState, "omc", repoKey)) {
                steps.push({
                    id: "omc-project",
                    optional: true,
                    command: "claude",
                    args: ["plugin", "update", "--scope", "project", OMC_PLUGIN_ID],
                    cwd,
                });
            }
            return steps;
        },
    },
    {
        id: "openagent",
        namespace: "oh-my",
        canonicalName: "opencode",
        aliases: ["openagent", "oh-my-openagent", "oh-my-opencode"],
        supportedScopes: ["user"],
        ownershipName: "Oh My OpenAgent for OpenCode",
        install: ({ vpCommand }) => [
            vpStep(vpCommand, "openagent", ["install", "-g", "oh-my-openagent"]),
            {
                id: "openagent-setup",
                command: "oh-my-openagent",
                args: ["install", "--no-tui", "--platform=opencode"],
            },
        ],
        update: ({ ownershipState, vpCommand }) => isUserOwnedTool(ownershipState, "openagent")
            ? [vpStep(vpCommand, "openagent", ["update", "-g", "oh-my-openagent"])]
            : [],
    },
];
const INVALID_DIRECT_NAMES = new Map(OPTIONAL_TOOL_ADAPTERS.filter((adapter) => adapter.namespace === "oh-my").flatMap((adapter) => [adapter.id, ...adapter.aliases].map((name) => [name, adapter])));
export function optionalToolCanonicalCommand(adapter) {
    const namespace = adapter.namespace === "oh-my" ? "oh-my " : "";
    return `wp install ${namespace}${adapter.canonicalName}`;
}
export function optionalToolCanonicalRemoveCommand(adapter) {
    const namespace = adapter.namespace === "oh-my" ? "oh-my " : "";
    return `wp remove ${namespace}${adapter.canonicalName}`;
}
export function optionalToolUsageExamples() {
    return [
        "Examples:",
        "  wp install codex",
        "  wp install claude-code",
        "  wp install opencode",
        "  wp install oh-my codex",
        "  wp install oh-my claude-code --scope user",
        "  wp install oh-my opencode",
        "  wp remove oh-my opencode",
    ].join("\n");
}
export function resolveOptionalTool(namespace, name) {
    for (const adapter of OPTIONAL_TOOL_ADAPTERS) {
        if (adapter.namespace !== namespace)
            continue;
        if (adapter.canonicalName === name || adapter.aliases.includes(name)) {
            return { adapter, alias: name };
        }
    }
    return null;
}
export function parseOptionalToolScopeArgs(args, adapter) {
    let scope = "user";
    let sawScope = false;
    for (let index = 0; index < args.length; index += 1) {
        const arg = args[index];
        let value;
        if (arg === "--scope") {
            if (sawScope)
                return optionalToolParseError(adapter, "duplicate --scope option");
            sawScope = true;
            value = args[index + 1];
            if (value === undefined)
                return optionalToolParseError(adapter, "--scope requires user or project");
            index += 1;
        }
        else if (arg.startsWith("--scope=")) {
            if (sawScope)
                return optionalToolParseError(adapter, "duplicate --scope option");
            sawScope = true;
            value = arg.slice("--scope=".length);
            if (value.length === 0)
                return optionalToolParseError(adapter, "--scope requires user or project");
        }
        else if (arg.startsWith("-")) {
            return optionalToolParseError(adapter, `unsupported option ${arg}`);
        }
        else {
            return optionalToolParseError(adapter, `unexpected argument ${arg}`);
        }
        if (value !== "user" && value !== "project") {
            return optionalToolParseError(adapter, `unsupported scope ${value}`);
        }
        scope = value;
    }
    if (!adapter.supportedScopes.includes(scope)) {
        return optionalToolParseError(adapter, `${adapter.ownershipName} does not support --scope ${scope}; use --scope user`);
    }
    return { kind: "ok", scope };
}
function optionalToolParseError(adapter, reason) {
    return {
        kind: "error",
        message: `${reason}. Use \`${optionalToolCanonicalCommand(adapter)}\`.\n${optionalToolUsageExamples()}`,
    };
}
export function parseOptionalToolCommandArgs(args) {
    if (args.length === 0)
        return { kind: "none" };
    const namespace = args[0] === "oh-my" ? "oh-my" : "base";
    const name = namespace === "oh-my" ? args[1] : args[0];
    const rest = namespace === "oh-my" ? args.slice(2) : args.slice(1);
    if (name === undefined) {
        return {
            kind: "error",
            message: `missing tool after oh-my.\n${optionalToolUsageExamples()}`,
        };
    }
    const resolved = resolveOptionalTool(namespace, name);
    if (!resolved) {
        if (namespace === "oh-my") {
            return {
                kind: "error",
                message: `unknown Oh My tool ${name}.\n${optionalToolUsageExamples()}`,
            };
        }
        const ohMyAdapter = INVALID_DIRECT_NAMES.get(name);
        if (ohMyAdapter) {
            return {
                kind: "error",
                message: `Use \`${optionalToolCanonicalCommand(ohMyAdapter)}\` for ${ohMyAdapter.ownershipName}.\n${optionalToolUsageExamples()}`,
            };
        }
        return { kind: "none" };
    }
    const parsedScope = parseOptionalToolScopeArgs(rest, resolved.adapter);
    if (parsedScope.kind === "error")
        return parsedScope;
    return {
        kind: "matched",
        adapter: resolved.adapter,
        alias: resolved.alias,
        scope: parsedScope.scope,
    };
}
export function claimOptionalToolOwnership(state, adapter, scope, repoKey) {
    if (scope === "user")
        return claimUserOwnedTool(state, adapter.id);
    if (adapter.id !== "omx" && adapter.id !== "omc") {
        return { error: `${adapter.ownershipName} does not support project ownership.` };
    }
    if (!repoKey)
        return { error: `project scope requires a git repo; use --scope user instead.` };
    return claimProjectOwnedTool(state, adapter.id, repoKey);
}
export function clearOptionalToolOwnership(state, adapter, scope, repoKey) {
    if (scope === "user")
        return clearUserOwnedTool(state, adapter.id);
    if (adapter.id !== "omx" && adapter.id !== "omc") {
        return { error: `${adapter.ownershipName} does not support project ownership.` };
    }
    if (!repoKey)
        return { error: `project scope requires a git repo; use --scope user instead.` };
    return clearProjectOwnedTool(state, adapter.id, repoKey);
}
export function optionalToolUpdateSteps(context) {
    return OPTIONAL_TOOL_ADAPTERS.flatMap((adapter) => adapter.update(context));
}
export function formatOptionalToolInstallSuccess(adapter, scope) {
    return `${adapter.ownershipName}: installed and marked WP-owned for ${scope} scope; future \`wp update\` refreshes this scope.`;
}
export function formatOptionalToolRemoveSuccess(adapter, scope) {
    return `${adapter.ownershipName}: cleared WP ${scope}-scope ownership; native uninstall was not attempted.`;
}
export function spawnResultStatus(result) {
    return typeof result.status === "number" ? result.status : 1;
}
//# sourceMappingURL=optional-tools.js.map