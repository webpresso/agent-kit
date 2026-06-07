import { type AgentCommandInventoryEntry } from '#cli/bundle/agent-command-inventory.js';
export interface AgentBundleCommandDefinition {
    readonly id: AgentCommandInventoryEntry['id'];
    readonly namespace: AgentCommandInventoryEntry['namespace'];
    readonly visibility: AgentCommandInventoryEntry['visibility'];
    readonly replacementCommand: AgentCommandInventoryEntry['replacementCommand'];
    readonly legacyAliases: AgentCommandInventoryEntry['legacyAliases'];
}
export interface AgentBundleDefinition {
    readonly bundleId: 'agent-kit';
    readonly commandRoot: 'agent';
    readonly sourcePackage: '@webpresso/agent-kit';
    readonly intendedHostPackage: '@repo/cli';
    readonly commands: readonly AgentBundleCommandDefinition[];
}
export declare const AGENT_BUNDLE: AgentBundleDefinition;
//# sourceMappingURL=index.d.ts.map