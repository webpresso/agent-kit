import type { CommandConfig, TestCommandOptions } from '#test';
import type { CAC } from 'cac';
export declare const TEST_COMMAND_HELP: string;
export interface AkTestCommandInput extends TestCommandOptions {
    cwd?: string;
    package?: readonly string[] | string;
    file?: readonly string[] | string;
    passthrough?: readonly string[];
}
export declare function createAkTestCommandConfig(input: AkTestCommandInput): CommandConfig;
export declare function registerTestCommand(cli: CAC): void;
//# sourceMappingURL=test.d.ts.map