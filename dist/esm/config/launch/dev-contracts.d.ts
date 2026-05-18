/**
 * Host-agnostic development-service contracts.
 *
 * These contracts describe the portable `webpresso agent dev` runtime surface without
 * naming any concrete supervisor, host app, or Webpresso service id.
 */
export type ServiceReadiness = {
    type: 'http';
    path?: string;
    url?: string;
    timeoutMs?: number;
    intervalMs?: number;
} | {
    type: 'log';
    pattern: string;
    timeoutMs?: number;
} | {
    type: 'manual';
    description?: string;
};
export interface DevRestartPolicy {
    onFailure?: boolean;
    maxRestarts?: number;
}
export interface DevServiceStartPlan {
    id: string;
    command: string;
    args: readonly string[];
    cwd?: string;
    env?: Record<string, string>;
    readiness?: ServiceReadiness;
    restart?: DevRestartPolicy;
}
export type DevServiceRuntimeStatus = 'running' | 'stopped' | 'errored' | 'unknown';
export interface DevServiceRuntimeState {
    id: string;
    status: DevServiceRuntimeStatus;
    message?: string;
}
export interface DevSupervisorAdapter {
    name: string;
    start(plan: DevServiceStartPlan): Promise<DevServiceRuntimeState>;
    stop(id: string): Promise<DevServiceRuntimeState>;
    restart(plan: DevServiceStartPlan): Promise<DevServiceRuntimeState>;
    status(id: string): Promise<DevServiceRuntimeState>;
}
//# sourceMappingURL=dev-contracts.d.ts.map