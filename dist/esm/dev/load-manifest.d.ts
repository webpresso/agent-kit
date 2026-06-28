export type AkDevMode = "start" | "doctor" | "clean" | "restart";
export interface AkDevService {
    id: string;
    command: string;
    args: string[];
    cwd?: string;
    env: Record<string, string>;
    dependsOn: string[];
    readiness?: unknown;
    restart?: unknown;
}
export interface AkDevManifest {
    version: 1;
    services: Record<string, AkDevService>;
    groups: Record<string, {
        services: string[];
        description?: string;
    }>;
    defaults: {
        target?: string;
    };
}
export interface ResolveManifestInput {
    cwd?: string;
    manifestPath?: string;
    env?: NodeJS.ProcessEnv;
}
export interface ResolvedManifest {
    manifestPath: string;
    manifest: AkDevManifest;
}
export declare function resolveManifestPath(input?: ResolveManifestInput): string;
export declare function loadDevManifest(input?: ResolveManifestInput): ResolvedManifest;
export declare function resolveDevServices(manifest: AkDevManifest, target?: string | undefined): string[];
//# sourceMappingURL=load-manifest.d.ts.map