import { agentCommands } from '#cli/bundle/commands/agent.js';
import { blueprintCommands } from '#cli/bundle/commands/blueprint.js';
import { AGENT_COMMAND_INVENTORY, } from '#cli/bundle/agent-command-inventory.js';
const sharedConfig = {
    apiVersion: 1,
    distributionProfiles: ['public', 'agent'],
    hostRange: '^0.1.0',
    version: '0.1.0',
};
export const agentBundle = {
    commands: agentCommands,
    config: {
        apiVersion: sharedConfig.apiVersion,
        distributionProfiles: sharedConfig.distributionProfiles,
        hostRange: sharedConfig.hostRange,
        namespaceRoots: ['agent'],
    },
    metadata: {
        description: 'Agent tooling bundle mounted under the public agent root',
        displayName: 'Agent bundle',
        profiles: sharedConfig.distributionProfiles,
        roots: ['agent'],
        visibility: 'public',
    },
    name: 'agent',
    version: sharedConfig.version,
};
export const blueprintBundle = {
    commands: blueprintCommands,
    config: {
        apiVersion: sharedConfig.apiVersion,
        distributionProfiles: sharedConfig.distributionProfiles,
        hostRange: sharedConfig.hostRange,
        namespaceRoots: ['blueprint'],
    },
    metadata: {
        description: 'Blueprint lifecycle bundle mounted under the blueprint root',
        displayName: 'Blueprint bundle',
        profiles: sharedConfig.distributionProfiles,
        roots: ['blueprint'],
        visibility: 'public',
    },
    name: 'blueprint',
    version: sharedConfig.version,
};
export const agentBundles = [blueprintBundle, agentBundle];
export const AGENT_BUNDLE = {
    bundleId: 'agent-kit',
    commandRoot: 'agent',
    sourcePackage: '@webpresso/agent-kit',
    intendedHostPackage: '@webpresso/cli-host',
    commands: AGENT_COMMAND_INVENTORY.map((entry) => ({
        id: entry.id,
        namespace: entry.namespace,
        visibility: entry.visibility,
        replacementCommand: entry.replacementCommand,
        legacyAliases: entry.legacyAliases,
    })),
};
export default agentBundle;
//# sourceMappingURL=index.js.map