export type CiActSecretProfileId = 'none' | 'github-api' | 'neon-control-plane';
export interface CiActSecretProfile {
    readonly id: CiActSecretProfileId;
    readonly description: string;
    readonly allowedKeys: readonly string[];
    readonly requiredKeys: readonly string[];
    readonly defaultSources: readonly string[];
}
export interface ResolveCiActSecretProfileOptions {
    readonly workflowPath?: string;
    readonly jobName?: string;
    readonly explicitProfileId?: string;
}
export declare function isCiActSecretProfileId(value: string): value is CiActSecretProfileId;
export declare function getCiActSecretProfile(profileId: CiActSecretProfileId): CiActSecretProfile;
export declare function resolveCiActSecretProfile(options: ResolveCiActSecretProfileOptions): CiActSecretProfile;
export declare function pickAllowedSecrets(secretMap: Record<string, string>, allowedKeys: readonly string[]): Record<string, string>;
export declare function listMissingRequiredSecrets(secretMap: Record<string, string>, requiredKeys: readonly string[]): string[];
export declare function normalizeActSecretsWithOptions(secretMaps: Array<Record<string, string>>, options: {
    mapGithubPatToToken: boolean;
}): Record<string, string>;
export declare function renderSecretsFile(secretMap: Record<string, string>): string;
export declare function injectDefaultActArgs(args: string[], platform?: NodeJS.Platform, arch?: NodeJS.Architecture): string[];
export interface TempSecretsFile {
    readonly path: string;
    cleanup(): void;
}
export declare function writeTempSecretsFile(secretMap: Record<string, string>): TempSecretsFile;
//# sourceMappingURL=act-helper.d.ts.map