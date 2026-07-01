import type { DevRestartPolicy, DevServiceStartPlan, ServiceReadiness } from "./dev-contracts.js";
export interface DevManifestServiceInput {
    command: string;
    args?: string[];
    cwd?: string;
    env?: Record<string, string>;
    readiness?: ServiceReadiness;
    dependsOn?: string[];
    restart?: DevRestartPolicy;
}
export interface DevManifestGroupInput {
    services: string[];
    description?: string;
}
export interface DevManifestInput {
    version: 1;
    name?: string;
    services: Record<string, DevManifestServiceInput>;
    groups?: Record<string, DevManifestGroupInput>;
    defaults?: {
        target?: string;
    };
}
export interface NormalizedDevService extends DevServiceStartPlan {
    dependsOn: string[];
}
export interface NormalizedDevGroup {
    services: string[];
    description?: string;
}
export interface NormalizedDevManifest {
    version: 1;
    name?: string;
    services: Record<string, NormalizedDevService>;
    groups: Record<string, NormalizedDevGroup>;
    defaults: {
        target?: string;
    };
}
export declare function parseDevManifest(raw: unknown): NormalizedDevManifest;
export declare function resolveDevTargets(manifest: NormalizedDevManifest, target?: string | undefined): string[];
//# sourceMappingURL=dev-manifest.d.ts.map