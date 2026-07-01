import type { SpawnSyncReturns } from "node:child_process";

import {
  claimProjectOwnedTool,
  claimUserOwnedTool,
  clearProjectOwnedTool,
  clearUserOwnedTool,
  isProjectOwnedTool,
  isUserOwnedTool,
  type ManagedToolName,
  type ToolingOwnershipState,
} from "#cli/tooling-ownership.js";
import { appendGlobalCapableVpArgs, type GlobalCapableVpCommandInput } from "#cli/global-vp.js";
import { OMC_MARKETPLACE, OMC_PLUGIN_ID } from "#cli/commands/init/scaffolders/omc/index.js";

export type OptionalToolScope = "user" | "project";
export type OptionalToolNamespace = "base" | "oh-my";

export interface OptionalToolCommandStep {
  readonly id: string;
  readonly command: string;
  readonly args: readonly string[];
  readonly cwd?: string;
  readonly optional?: boolean;
}

export interface OptionalToolCommandContext {
  readonly scope: OptionalToolScope;
  readonly vpCommand: GlobalCapableVpCommandInput;
  readonly cwd: string;
}

export interface OptionalToolUpdateContext {
  readonly ownershipState: ToolingOwnershipState;
  readonly repoKey: string | null;
  readonly vpCommand: GlobalCapableVpCommandInput;
  readonly cwd: string;
}

export interface OptionalToolAdapter {
  readonly id: ManagedToolName;
  readonly namespace: OptionalToolNamespace;
  readonly canonicalName: string;
  readonly aliases: readonly string[];
  readonly supportedScopes: readonly OptionalToolScope[];
  readonly ownershipName: string;
  readonly install: (context: OptionalToolCommandContext) => readonly OptionalToolCommandStep[];
  readonly update: (context: OptionalToolUpdateContext) => readonly OptionalToolCommandStep[];
}

export type ResolvedOptionalTool = {
  readonly adapter: OptionalToolAdapter;
  readonly alias: string;
};

export type ParsedOptionalToolArgs =
  | { readonly kind: "ok"; readonly scope: OptionalToolScope }
  | { readonly kind: "error"; readonly message: string };

export type OptionalToolResolution =
  | { readonly kind: "none" }
  | { readonly kind: "error"; readonly message: string }
  | {
      readonly kind: "matched";
      readonly adapter: OptionalToolAdapter;
      readonly alias: string;
      readonly scope: OptionalToolScope;
    };

function vpStep(
  vpCommand: GlobalCapableVpCommandInput,
  id: string,
  args: readonly string[],
): OptionalToolCommandStep {
  const command = appendGlobalCapableVpArgs(vpCommand, args);
  return { id, command: command[0]!, args: command.slice(1), optional: true };
}

function packageAdapter(input: {
  readonly id: ManagedToolName;
  readonly canonicalName: string;
  readonly packageName: string;
  readonly ownershipName: string;
  readonly aliases?: readonly string[];
}): OptionalToolAdapter {
  return {
    id: input.id,
    namespace: "base",
    canonicalName: input.canonicalName,
    aliases: input.aliases ?? [],
    supportedScopes: ["user"],
    ownershipName: input.ownershipName,
    install: ({ vpCommand }) => [vpStep(vpCommand, input.id, ["install", "-g", input.packageName])],
    update: ({ ownershipState, vpCommand }) =>
      isUserOwnedTool(ownershipState, input.id)
        ? [vpStep(vpCommand, input.id, ["update", "-g", input.packageName])]
        : [],
  };
}

const OPENAGENT_INSTALL_ARGS = [
  "dlx",
  "oh-my-openagent@latest",
  "install",
  "--no-tui",
  "--platform=opencode",
  "--claude=no",
  "--gemini=no",
  "--copilot=no",
  "--openai=no",
  "--opencode-zen=no",
  "--zai-coding-plan=no",
  "--opencode-go=no",
  "--kimi-for-coding=no",
  "--vercel-ai-gateway=no",
] as const;

export const OPTIONAL_TOOL_ADAPTERS: readonly OptionalToolAdapter[] = [
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
    update: ({ ownershipState, repoKey, vpCommand }) =>
      isUserOwnedTool(ownershipState, "omx") || isProjectOwnedTool(ownershipState, "omx", repoKey)
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
      const steps: OptionalToolCommandStep[] = [];
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
    aliases: ["openagent", "omo", "oh-my-openagent", "oh-my-opencode"],
    supportedScopes: ["user"],
    ownershipName: "Oh My OpenAgent for OpenCode",
    install: ({ vpCommand }) => [vpStep(vpCommand, "openagent", OPENAGENT_INSTALL_ARGS)],
    update: ({ ownershipState, vpCommand }) =>
      isUserOwnedTool(ownershipState, "openagent")
        ? [vpStep(vpCommand, "openagent", OPENAGENT_INSTALL_ARGS)]
        : [],
  },
];

const INVALID_DIRECT_NAMES = new Map(
  OPTIONAL_TOOL_ADAPTERS.filter((adapter) => adapter.namespace === "oh-my").flatMap((adapter) =>
    [adapter.id, ...adapter.aliases].map((name) => [name, adapter] as const),
  ),
);

export function optionalToolCanonicalCommand(adapter: OptionalToolAdapter): string {
  const namespace = adapter.namespace === "oh-my" ? "oh-my " : "";
  return `wp install ${namespace}${adapter.canonicalName}`;
}

export function optionalToolCanonicalRemoveCommand(adapter: OptionalToolAdapter): string {
  const namespace = adapter.namespace === "oh-my" ? "oh-my " : "";
  return `wp remove ${namespace}${adapter.canonicalName}`;
}

export function optionalToolUsageExamples(): string {
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

export function resolveOptionalTool(
  namespace: OptionalToolNamespace,
  name: string,
): ResolvedOptionalTool | null {
  for (const adapter of OPTIONAL_TOOL_ADAPTERS) {
    if (adapter.namespace !== namespace) continue;
    if (adapter.canonicalName === name || adapter.aliases.includes(name)) {
      return { adapter, alias: name };
    }
  }
  return null;
}

export function parseOptionalToolScopeArgs(
  args: readonly string[],
  adapter: OptionalToolAdapter,
): ParsedOptionalToolArgs {
  let scope: OptionalToolScope = "user";
  let sawScope = false;

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index]!;
    let value: string | undefined;

    if (arg === "--scope") {
      if (sawScope) return optionalToolParseError(adapter, "duplicate --scope option");
      sawScope = true;
      value = args[index + 1];
      if (value === undefined)
        return optionalToolParseError(adapter, "--scope requires user or project");
      index += 1;
    } else if (arg.startsWith("--scope=")) {
      if (sawScope) return optionalToolParseError(adapter, "duplicate --scope option");
      sawScope = true;
      value = arg.slice("--scope=".length);
      if (value.length === 0)
        return optionalToolParseError(adapter, "--scope requires user or project");
    } else if (arg.startsWith("-")) {
      return optionalToolParseError(adapter, `unsupported option ${arg}`);
    } else {
      return optionalToolParseError(adapter, `unexpected argument ${arg}`);
    }

    if (value !== "user" && value !== "project") {
      return optionalToolParseError(adapter, `unsupported scope ${value}`);
    }
    scope = value;
  }

  if (!adapter.supportedScopes.includes(scope)) {
    return optionalToolParseError(
      adapter,
      `${adapter.ownershipName} does not support --scope ${scope}; use --scope user`,
    );
  }

  return { kind: "ok", scope };
}

function optionalToolParseError(
  adapter: OptionalToolAdapter,
  reason: string,
): ParsedOptionalToolArgs {
  return {
    kind: "error",
    message: `${reason}. Use \`${optionalToolCanonicalCommand(adapter)}\`.\n${optionalToolUsageExamples()}`,
  };
}

export function parseOptionalToolCommandArgs(args: readonly string[]): OptionalToolResolution {
  if (args.length === 0) return { kind: "none" };

  const namespace: OptionalToolNamespace = args[0] === "oh-my" ? "oh-my" : "base";
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
  if (parsedScope.kind === "error") return parsedScope;
  return {
    kind: "matched",
    adapter: resolved.adapter,
    alias: resolved.alias,
    scope: parsedScope.scope,
  };
}

export function claimOptionalToolOwnership(
  state: ToolingOwnershipState,
  adapter: OptionalToolAdapter,
  scope: OptionalToolScope,
  repoKey: string | null,
): ToolingOwnershipState | { readonly error: string } {
  if (scope === "user") return claimUserOwnedTool(state, adapter.id);
  if (adapter.id !== "omx" && adapter.id !== "omc") {
    return { error: `${adapter.ownershipName} does not support project ownership.` };
  }
  if (!repoKey) return { error: `project scope requires a git repo; use --scope user instead.` };
  return claimProjectOwnedTool(state, adapter.id, repoKey);
}

export function clearOptionalToolOwnership(
  state: ToolingOwnershipState,
  adapter: OptionalToolAdapter,
  scope: OptionalToolScope,
  repoKey: string | null,
): ToolingOwnershipState | { readonly error: string } {
  if (scope === "user") return clearUserOwnedTool(state, adapter.id);
  if (adapter.id !== "omx" && adapter.id !== "omc") {
    return { error: `${adapter.ownershipName} does not support project ownership.` };
  }
  if (!repoKey) return { error: `project scope requires a git repo; use --scope user instead.` };
  return clearProjectOwnedTool(state, adapter.id, repoKey);
}

export function optionalToolUpdateSteps(
  context: OptionalToolUpdateContext,
): readonly OptionalToolCommandStep[] {
  return OPTIONAL_TOOL_ADAPTERS.flatMap((adapter) => adapter.update(context));
}

export function formatOptionalToolInstallSuccess(
  adapter: OptionalToolAdapter,
  scope: OptionalToolScope,
): string {
  return `${adapter.ownershipName}: installed and marked WP-owned for ${scope} scope; future \`wp update\` refreshes this scope.`;
}

export function formatOptionalToolRemoveSuccess(
  adapter: OptionalToolAdapter,
  scope: OptionalToolScope,
): string {
  return `${adapter.ownershipName}: cleared WP ${scope}-scope ownership; native uninstall was not attempted.`;
}

export function spawnResultStatus(result: SpawnSyncReturns<string>): number {
  return typeof result.status === "number" ? result.status : 1;
}
