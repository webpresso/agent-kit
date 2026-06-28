import type { HooksMap } from "#cli/commands/init/scaffolders/agent-hooks/ir.js";
import { type HookVendorState } from "#cli/commands/init/scaffolders/agent-hooks/manifest.js";
import { type InstalledHookVendor } from "#hooks/shared/installed-hooks.js";
export type HookDemoVerdict = "would-enforce" | "would-run" | "skipped-matcher" | "disabled";
export interface HookDemoRow {
    readonly hook: string;
    readonly command: string;
    readonly matcher?: string;
    readonly verdict: HookDemoVerdict;
    readonly reason: string;
}
export interface HookDemoResult {
    readonly event: string;
    readonly vendor: InstalledHookVendor;
    readonly tool?: string;
    readonly rows: readonly HookDemoRow[];
}
export declare function simulateHookDemo(input: {
    hooksMap: HooksMap;
    event: string;
    vendor: InstalledHookVendor;
    tool?: string;
    vendorState?: HookVendorState;
}): HookDemoResult;
export interface DemoCommandDeps {
    readonly stdout?: Pick<NodeJS.WriteStream, "write">;
    readonly cwd?: string;
    readonly env?: NodeJS.ProcessEnv;
}
export declare function demoCommand(argv: readonly string[], deps?: DemoCommandDeps): Promise<void>;
//# sourceMappingURL=index.d.ts.map