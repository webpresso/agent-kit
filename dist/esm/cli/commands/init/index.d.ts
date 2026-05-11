import type { CAC } from 'cac';
export interface InitFlags {
    with?: string;
    all?: boolean;
    overwrite?: boolean;
    'dry-run'?: boolean;
    yes?: boolean;
    cwd?: string;
}
export declare const EXIT_SUCCESS = 0;
export declare const EXIT_SETUP_FAIL = 1;
export declare const EXIT_USER_ABORT = 2;
export declare const EXIT_WRITE_FAIL = 3;
export declare function resolveCatalogDir(): string;
export declare function runInit(flags: InitFlags): Promise<number>;
export type InitCommandName = 'setup' | 'init';
export declare function registerInitCommand(cli: CAC, commandName?: InitCommandName): void;
//# sourceMappingURL=index.d.ts.map