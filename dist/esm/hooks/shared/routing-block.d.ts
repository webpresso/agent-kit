/**
 * WP_ROUTING_BLOCK — XML routing instruction injected into every session
 * via SessionStart `additionalContext`. Tells Claude to prefer wp_* MCP tools
 * over raw shell commands for dev-workflow operations.
 */
export declare const WP_ROUTING_BLOCK: string;
export type RoutingInstructionSource = {
    readonly name: 'wp_routing';
    readonly content: string;
};
export declare function createRoutingInstructionSource(): RoutingInstructionSource;
//# sourceMappingURL=routing-block.d.ts.map