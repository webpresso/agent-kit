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
export declare const AGENT_COMMAND_INVENTORY: readonly [{
    readonly id: "agent setup";
    readonly namespace: "agent";
    readonly visibility: "public";
    readonly replacementCommand: "webpresso agent setup";
    readonly legacyAliases: readonly [{
        readonly legacyCommand: "wp setup";
        readonly replacementCommand: "webpresso agent setup";
    }, {
        readonly legacyCommand: "wp init";
        readonly replacementCommand: "webpresso agent setup";
    }];
}, {
    readonly id: "agent sync";
    readonly namespace: "agent";
    readonly visibility: "public";
    readonly replacementCommand: "webpresso agent sync";
    readonly legacyAliases: readonly [{
        readonly legacyCommand: "wp sync";
        readonly replacementCommand: "webpresso agent sync";
    }];
}, {
    readonly id: "agent audit";
    readonly namespace: "agent";
    readonly visibility: "public";
    readonly replacementCommand: "webpresso agent audit";
    readonly legacyAliases: readonly [{
        readonly legacyCommand: "wp audit";
        readonly replacementCommand: "webpresso agent audit";
    }];
}, {
    readonly id: "agent skills";
    readonly namespace: "agent";
    readonly visibility: "public";
    readonly replacementCommand: "webpresso agent skills";
    readonly legacyAliases: readonly [{
        readonly legacyCommand: "wp skill";
        readonly replacementCommand: "webpresso agent skills";
    }, {
        readonly legacyCommand: "wp skills";
        readonly replacementCommand: "webpresso agent skills";
    }];
}, {
    readonly id: "agent docs lint";
    readonly namespace: "agent";
    readonly visibility: "public";
    readonly replacementCommand: "webpresso agent docs lint";
    readonly legacyAliases: readonly [{
        readonly legacyCommand: "wp docs";
        readonly replacementCommand: "webpresso agent docs lint";
    }, {
        readonly legacyCommand: "wp docs lint";
        readonly replacementCommand: "webpresso agent docs lint";
    }];
}, {
    readonly id: "agent hooks doctor";
    readonly namespace: "agent";
    readonly visibility: "public";
    readonly replacementCommand: "webpresso agent hooks doctor";
    readonly legacyAliases: readonly [{
        readonly legacyCommand: "wp hooks";
        readonly replacementCommand: "webpresso agent hooks doctor";
    }, {
        readonly legacyCommand: "wp hooks doctor";
        readonly replacementCommand: "webpresso agent hooks doctor";
    }, {
        readonly legacyCommand: "wp doctor";
        readonly replacementCommand: "webpresso agent hooks doctor";
    }];
}, {
    readonly id: "agent blueprint";
    readonly namespace: "agent";
    readonly visibility: "public";
    readonly replacementCommand: "webpresso agent blueprint";
    readonly legacyAliases: readonly [{
        readonly legacyCommand: "wp blueprint";
        readonly replacementCommand: "webpresso agent blueprint";
    }];
}, {
    readonly id: "agent test";
    readonly namespace: "agent";
    readonly visibility: "public";
    readonly replacementCommand: "webpresso agent test";
    readonly legacyAliases: readonly [{
        readonly legacyCommand: "wp test";
        readonly replacementCommand: "webpresso agent test";
    }];
}, {
    readonly id: "agent e2e";
    readonly namespace: "agent";
    readonly visibility: "public";
    readonly replacementCommand: "webpresso agent e2e";
    readonly legacyAliases: readonly [{
        readonly legacyCommand: "wp e2e";
        readonly replacementCommand: "webpresso agent e2e";
    }];
}, {
    readonly id: "agent tech-debt";
    readonly namespace: "agent";
    readonly visibility: "public";
    readonly replacementCommand: "webpresso agent tech-debt";
    readonly legacyAliases: readonly [{
        readonly legacyCommand: "wp tech-debt";
        readonly replacementCommand: "webpresso agent tech-debt";
    }];
}];
export declare function getLegacyAgentCommandReplacement(legacyCommand: string): string | null;
//# sourceMappingURL=agent-command-inventory.d.ts.map