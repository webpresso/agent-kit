import type { CliCommand } from '@webpresso/cli-contract';
export declare function getCommandRawArgs(context: Parameters<NonNullable<CliCommand['run']>>[0] & {
    readonly rawArgs?: readonly string[];
}): readonly string[];
export declare function placeholderCommand(scope: string, name: string, description: string): CliCommand;
export declare function placeholderGroup(scope: string, name: string, description: string, subCommands: Record<string, CliCommand>): CliCommand;
//# sourceMappingURL=helpers.d.ts.map