export type GuidanceType = 'test' | 'lint' | 'typecheck' | 'qa';
export type DevRoutingDecision = {
    action: 'deny';
    guidance: string;
};
export declare function routeDevCommand(command: string, sessionId?: string): DevRoutingDecision | null;
//# sourceMappingURL=dev-routing.d.ts.map