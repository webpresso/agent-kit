import { AGENT_COMMAND_INVENTORY, } from '#cli/bundle/agent-command-inventory.js';
export const AGENT_BUNDLE = {
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
};
//# sourceMappingURL=index.js.map