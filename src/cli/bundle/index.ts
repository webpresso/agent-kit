import {
  AGENT_COMMAND_INVENTORY,
  type AgentCommandInventoryEntry,
} from '#cli/bundle/agent-command-inventory.js'

export interface AgentBundleCommandDefinition {
  readonly id: AgentCommandInventoryEntry['id']
  readonly namespace: AgentCommandInventoryEntry['namespace']
  readonly visibility: AgentCommandInventoryEntry['visibility']
  readonly replacementCommand: AgentCommandInventoryEntry['replacementCommand']
  readonly legacyAliases: AgentCommandInventoryEntry['legacyAliases']
}

export interface AgentBundleDefinition {
  readonly bundleId: 'agent-kit'
  readonly commandRoot: 'agent'
  readonly sourcePackage: '@webpresso/agent-kit'
  readonly intendedHostPackage: '@repo/cli'
  readonly commands: readonly AgentBundleCommandDefinition[]
}

export const AGENT_BUNDLE: AgentBundleDefinition = {
  bundleId: 'agent-kit',
  commandRoot: 'agent',
  sourcePackage: '@webpresso/agent-kit',
  intendedHostPackage: '@repo/cli',
  commands: AGENT_COMMAND_INVENTORY.map((entry) => ({
    id: entry.id,
    namespace: entry.namespace,
    visibility: entry.visibility,
    replacementCommand: entry.replacementCommand,
    legacyAliases: entry.legacyAliases,
  })),
}
