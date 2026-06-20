interface ParsedCommand {
    readonly command: string;
    readonly args: string[];
    readonly profile?: string;
    readonly environment?: string;
}
export declare function parseWithSecretsArgs(argv: readonly string[]): ParsedCommand | null;
export declare function runWithSecretsCli(argv?: readonly string[]): number;
export declare function isDirectWithSecretsCliEntrypoint(argv?: readonly string[], moduleUrl?: string): boolean;
export {};
//# sourceMappingURL=with-secrets-cli.d.ts.map