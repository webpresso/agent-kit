export type AgentCommandVisibility = "public" | "internal";

export interface LegacyAgentCommandAlias {
  legacyCommand: string;
  replacementCommand: string;
}

export interface AgentCommandInventoryEntry {
  id: string;
  namespace: "agent";
  visibility: AgentCommandVisibility;
  replacementCommand: string;
  legacyAliases: readonly LegacyAgentCommandAlias[];
}

export const AGENT_COMMAND_INVENTORY = [
  {
    id: "agent setup",
    namespace: "agent",
    visibility: "public",
    replacementCommand: "webpresso agent setup",
    legacyAliases: [
      { legacyCommand: "wp setup", replacementCommand: "webpresso agent setup" },
      { legacyCommand: "wp init", replacementCommand: "webpresso agent setup" },
    ],
  },
  {
    id: "agent sync",
    namespace: "agent",
    visibility: "public",
    replacementCommand: "webpresso agent sync",
    legacyAliases: [{ legacyCommand: "wp sync", replacementCommand: "webpresso agent sync" }],
  },
  {
    id: "agent audit",
    namespace: "agent",
    visibility: "public",
    replacementCommand: "webpresso agent audit",
    legacyAliases: [{ legacyCommand: "wp audit", replacementCommand: "webpresso agent audit" }],
  },
  {
    id: "agent skills",
    namespace: "agent",
    visibility: "public",
    replacementCommand: "webpresso agent skills",
    legacyAliases: [
      { legacyCommand: "wp skill", replacementCommand: "webpresso agent skills" },
      { legacyCommand: "wp skills", replacementCommand: "webpresso agent skills" },
    ],
  },
  {
    id: "agent docs lint",
    namespace: "agent",
    visibility: "public",
    replacementCommand: "webpresso agent docs lint",
    legacyAliases: [
      { legacyCommand: "wp docs", replacementCommand: "webpresso agent docs lint" },
      { legacyCommand: "wp docs lint", replacementCommand: "webpresso agent docs lint" },
    ],
  },
  {
    id: "agent hooks doctor",
    namespace: "agent",
    visibility: "public",
    replacementCommand: "webpresso agent hooks doctor",
    legacyAliases: [
      { legacyCommand: "wp hooks", replacementCommand: "webpresso agent hooks doctor" },
      { legacyCommand: "wp hooks doctor", replacementCommand: "webpresso agent hooks doctor" },
      { legacyCommand: "wp doctor", replacementCommand: "webpresso agent hooks doctor" },
    ],
  },
  {
    id: "agent blueprint",
    namespace: "agent",
    visibility: "public",
    replacementCommand: "webpresso agent blueprint",
    legacyAliases: [
      { legacyCommand: "wp blueprint", replacementCommand: "webpresso agent blueprint" },
    ],
  },
  {
    id: "agent test",
    namespace: "agent",
    visibility: "public",
    replacementCommand: "webpresso agent test",
    legacyAliases: [{ legacyCommand: "wp test", replacementCommand: "webpresso agent test" }],
  },
  {
    id: "agent e2e",
    namespace: "agent",
    visibility: "public",
    replacementCommand: "webpresso agent e2e",
    legacyAliases: [{ legacyCommand: "wp e2e", replacementCommand: "webpresso agent e2e" }],
  },
  {
    id: "agent tech-debt",
    namespace: "agent",
    visibility: "public",
    replacementCommand: "webpresso agent tech-debt",
    legacyAliases: [
      { legacyCommand: "wp tech-debt", replacementCommand: "webpresso agent tech-debt" },
    ],
  },
] as const satisfies readonly AgentCommandInventoryEntry[];

export function getLegacyAgentCommandReplacement(legacyCommand: string): string | null {
  const normalized = legacyCommand.trim().replace(/\s+/gu, " ").toLowerCase();
  for (const entry of AGENT_COMMAND_INVENTORY) {
    for (const alias of entry.legacyAliases) {
      if (alias.legacyCommand.toLowerCase() === normalized) return alias.replacementCommand;
    }
  }
  return null;
}
