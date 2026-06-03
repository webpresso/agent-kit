export type VersionPinTool = 'context_mode' | 'rtk';
export type VersionPinResult = {
    ok: true;
} | {
    ok: false;
    warning: string;
};
/**
 * Reads compatible-versions.json and checks whether `installedVersion`
 * satisfies the pinned range for `tool`.
 *
 * @param tool             - 'context_mode' | 'rtk'
 * @param installedVersion - the version string reported by the tool binary
 * @param pinFilePath      - absolute path to compatible-versions.json; callers
 *                           should pass `join(repoRoot, 'compatible-versions.json')`
 *                           since scaffolders already have repoRoot from detectConsumer.
 */
export declare function checkVersionPin(tool: VersionPinTool, installedVersion: string, pinFilePath: string): VersionPinResult;
//# sourceMappingURL=version-pin.d.ts.map