import type { CAC } from 'cac';
export interface CompileResult {
    readonly ok: boolean;
    readonly targets: readonly string[];
    readonly noOp: boolean;
    readonly message: string;
}
export interface CompileManifest {
    readonly version: number;
    readonly timestamp: string;
    readonly sourceHash: string;
    readonly outputHashes: Readonly<Record<string, string>>;
}
/** SHA-256 hash of all .md files under agentDir, recursively (content only). */
export declare function hashAgentDir(agentDir: string): string;
export declare function runCompile(options: {
    cwd: string;
    targets: string;
}): Promise<CompileResult>;
export declare function registerCompileCommand(cli: CAC): void;
//# sourceMappingURL=compile.d.ts.map