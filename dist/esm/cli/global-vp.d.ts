export interface GlobalCapableVpCommand {
    readonly command: string;
    readonly argsPrefix: readonly string[];
    readonly executable: string;
}
export type GlobalCapableVpCommandInput = string | GlobalCapableVpCommand;
export declare function appendGlobalCapableVpArgs(vpCommand: GlobalCapableVpCommandInput, args: readonly string[]): [string, ...string[]];
export declare function resolveGlobalCapableVpCommand(pathValue?: string, platformValue?: NodeJS.Platform, env?: NodeJS.ProcessEnv): GlobalCapableVpCommand | null;
export declare function resolveGlobalCapableVp(pathValue?: string, platformValue?: NodeJS.Platform): string | null;
//# sourceMappingURL=global-vp.d.ts.map