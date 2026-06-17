export type CiActEventName = 'pull_request' | 'push' | 'workflow_dispatch';
export interface PublicCiActOptions {
    readonly cwd?: string;
    readonly workflow?: string;
    readonly workflowPath?: string;
    readonly job?: string;
    readonly eventName?: CiActEventName;
    readonly eventPath?: string;
    readonly envProfile?: string;
    readonly containerArchitecture?: string;
    readonly platformImage?: string;
    readonly execute?: boolean;
}
export interface PublicCiActCommand {
    readonly command: string;
    readonly args: readonly string[];
    readonly actArgs: readonly string[];
}
export declare const DEFAULT_PLATFORM_IMAGE = "ghcr.io/catthehacker/ubuntu:full-latest";
export declare function resolveDefaultContainerArchitecture(platform?: NodeJS.Platform, arch?: NodeJS.Architecture): string;
export declare function assertSupportedDefaultPlatformImageArchitecture(platformImage: string, containerArchitecture: string): void;
export declare function resolveCiActWorkflowPath(options?: PublicCiActOptions): string;
export declare function buildPublicCiActArgs(options?: PublicCiActOptions): string[];
export declare function buildPublicCiActCommand(options?: PublicCiActOptions): PublicCiActCommand;
export declare function sanitizePublicCiActArgv(command: PublicCiActCommand): PublicCiActCommand;
export declare function assertNoForbiddenCiActArgs(args: readonly string[]): void;
//# sourceMappingURL=act-runner.d.ts.map