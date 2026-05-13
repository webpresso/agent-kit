export interface ManifestEmitOptions {
    readonly agentDir: string;
    readonly outDir: string;
    readonly version: string;
    readonly skills: readonly string[];
    readonly commands: readonly string[];
}
export declare function emitManifest(opts: ManifestEmitOptions): Promise<void>;
//# sourceMappingURL=cursor.d.ts.map