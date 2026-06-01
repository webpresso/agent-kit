export interface FlattenedAssets {
    readonly skills: Readonly<Record<string, string>>;
    readonly commands: Readonly<Record<string, string>>;
    readonly agents: Readonly<Record<string, string>>;
}
/** Reads `.agent/{skills,commands,agents}/` and returns an in-memory flattened structure. */
export declare function flattenAgentDir(agentDir: string): FlattenedAssets;
/** Writes flattened assets to a directory structure mirroring rulesync's expected layout. */
export declare function writeFlattenedAssets(assets: FlattenedAssets, outDir: string): Promise<void>;
//# sourceMappingURL=flatten.d.ts.map