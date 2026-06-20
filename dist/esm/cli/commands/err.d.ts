import type { CAC } from 'cac';
import type { SpawnSyncReturns } from 'node:child_process';
export declare const ERR_COMMAND_HELP: string;
export interface ErrCommandDeps {
    readonly run?: (command: string, args: readonly string[]) => SpawnSyncReturns<string>;
    readonly stdout?: Pick<NodeJS.WriteStream, 'write'>;
    readonly stderr?: Pick<NodeJS.WriteStream, 'write'>;
}
export declare function registerErrCommand(cli: CAC): void;
export declare function runErrCommand(commandParts: readonly string[], deps?: ErrCommandDeps): number;
//# sourceMappingURL=err.d.ts.map