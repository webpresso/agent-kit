export declare const rootContractMode: "js-selector-runtime-lane";
export declare const expectedRootWpBinRelativePath: "bin/wp";
export declare const rootWpSelectorSource = "#!/usr/bin/env node\n\nimport { runNamedBin } from './_run.js'\n\nrunNamedBin('wp')\n";
export type RootLauncherValidationCode = "ok" | "missing" | "symlink" | "symlink-runtime-target" | "not-file" | "not-executable" | "invalid-selector";
export interface RootLauncherValidationResult {
    readonly ok: boolean;
    readonly code: RootLauncherValidationCode;
    readonly path: string;
}
export declare function validateRootLauncherContract(path: string): RootLauncherValidationResult;
export declare function formatRootLauncherContractSuccess(subject?: "bin/wp"): string;
export declare function formatRootLauncherContractFailure(result: RootLauncherValidationResult, subject?: "bin/wp"): string;
//# sourceMappingURL=root-contract.d.ts.map