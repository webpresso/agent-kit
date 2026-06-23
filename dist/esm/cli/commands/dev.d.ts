import type { CAC } from 'cac';
import { type AkDevMode } from '#dev/index';
export interface RunDevCommandInput {
    cwd?: string;
    manifestPath?: string;
    mode?: AkDevMode;
    target?: string;
}
export interface RunDevCommandResult {
    mode: AkDevMode;
    manifestPath: string;
    services: string[];
}
type RuntimeHooksAction = 'enable' | 'disable' | 'status';
export interface RuntimeHooksResult {
    readonly enabled: boolean;
    readonly sourceRepo: boolean;
    readonly statePath: string;
}
export declare function runRuntimeHooksCommand(action: RuntimeHooksAction, input?: {
    cwd?: string;
}): RuntimeHooksResult;
export declare function getDevHelpText(): string;
export declare function runDevCommand(input: RunDevCommandInput): Promise<RunDevCommandResult>;
export declare function registerDevCommand(cli: CAC): void;
export {};
//# sourceMappingURL=dev.d.ts.map