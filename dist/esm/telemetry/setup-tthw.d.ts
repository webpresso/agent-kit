export interface TthwPayload {
    readonly event: 'setup-complete';
    readonly durationMs: number;
    readonly webpressoVersion: string;
    readonly os: string;
    readonly nodeVersion: string;
}
export declare function isTelemetryEnabled(env: Record<string, string | undefined>): boolean;
export declare function reportTthw(payload: TthwPayload): Promise<void>;
//# sourceMappingURL=setup-tthw.d.ts.map