import type { CAC } from "cac";
import { type OutputWriter } from "./scaffolders/agent-hooks/report.js";
export interface InitFlags {
    with?: string;
    without?: string;
    host?: string;
    all?: boolean;
    overwrite?: boolean;
    "dry-run"?: boolean;
    dryRun?: boolean;
    prune?: boolean;
    "restore-hooks"?: boolean;
    restoreHooks?: boolean;
    "disable-hooks"?: string;
    disableHooks?: string;
    yes?: boolean;
    cwd?: string;
    strict?: boolean;
    project?: boolean;
    "user-only"?: boolean;
    userOnly?: boolean;
    "project-init"?: boolean;
    projectInit?: boolean;
    sourceMaintenance?: boolean;
}
export declare const EXIT_SUCCESS = 0;
export declare const EXIT_SETUP_FAIL = 1;
export declare const EXIT_USER_ABORT = 2;
export declare const EXIT_WRITE_FAIL = 3;
export interface InitCommandDeps {
    readonly stdout?: OutputWriter;
}
export interface ResolveCatalogDirOptions {
    readonly moduleUrl?: string;
    readonly execPath?: string;
    readonly argv0?: string;
    readonly argv1?: string;
    readonly pathEnv?: string;
}
export declare function resolveCatalogDir(options?: ResolveCatalogDirOptions): string;
export declare function formatHostSetupSurfaceVisibility(input: {
    readonly repoRoot: string;
    readonly packageRoot: string;
}): string;
export declare function runInit(flags: InitFlags, deps?: InitCommandDeps): Promise<number>;
export type InitCommandName = "setup" | "init";
export declare function registerInitCommand(cli: CAC, commandName?: InitCommandName): void;
//# sourceMappingURL=index.d.ts.map