import type { CAC } from "cac";
import { createDeployPlan, runDeployPlan } from "#deploy/run.js";
export interface PreviewCommandOptions {
    readonly cwd?: string;
    readonly lane?: string;
    readonly json?: boolean;
    readonly execute?: boolean;
}
export interface PreviewCommandDeps {
    readonly stdout?: Pick<NodeJS.WriteStream, "write">;
    readonly stderr?: Pick<NodeJS.WriteStream, "write">;
    readonly createPlan?: typeof createDeployPlan;
    readonly runPlan?: typeof runDeployPlan;
}
export declare function registerPreviewCommand(cli: CAC): void;
export declare function runPreviewCommand(options?: PreviewCommandOptions, deps?: PreviewCommandDeps): Promise<number>;
//# sourceMappingURL=preview.d.ts.map