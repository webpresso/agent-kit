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
export declare function getDevHelpText(): string;
export declare function runDevCommand(input: RunDevCommandInput): Promise<RunDevCommandResult>;
export declare function registerDevCommand(cli: CAC): void;
//# sourceMappingURL=dev.d.ts.map