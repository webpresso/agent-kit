export type GuidanceType = 'test' | 'lint' | 'typecheck' | 'qa';
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
    throttleKey?: string;
}
export declare function routeCommand(command: string, sessionId?: string): RouteDecision | null;
//# sourceMappingURL=dev-routing.d.ts.map