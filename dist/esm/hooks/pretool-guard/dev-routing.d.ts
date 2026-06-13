export type GuidanceType = 'test' | 'lint' | 'typecheck' | 'qa' | 'format' | 'e2e' | 'worktree';
export type RouteAction = {
    action: 'deny';
    tool: string;
    guidance: string;
} | {
    action: 'sandbox';
    guidance: string;
} | {
    action: 'passthrough';
};
export interface RouteDecision {
    action: RouteAction;
}
export declare function normalizeCommandForRouting(command: string): string;
export declare function extractRoutableCommandsFromToolInput(input: {
    tool_name?: string;
    toolName?: string;
    tool?: string;
    name?: string;
    tool_input?: Record<string, unknown>;
    toolInput?: Record<string, unknown>;
    input?: Record<string, unknown>;
    arguments?: Record<string, unknown>;
}): string[];
export declare function routeCommand(command: string, _sessionId?: string): RouteDecision | null;
//# sourceMappingURL=dev-routing.d.ts.map