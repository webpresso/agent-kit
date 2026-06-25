import type { AgentkitConfig } from "./config.js";
export interface FileSnapshot {
    relativePath: string;
    content: string;
}
export declare function captureConfiguredPreservedFiles(root: string, config: AgentkitConfig | null): FileSnapshot[];
export declare function restoreChangedSnapshots(root: string, snapshots: readonly FileSnapshot[]): string[];
//# sourceMappingURL=preserved-files.d.ts.map