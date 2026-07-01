import type { CAC } from "cac";
export interface MigrationPatch {
    readonly file: string;
    readonly action: "delete" | "replace" | "remove-dependency";
    readonly reason: string;
}
export interface MigrateSecretsOptions {
    readonly cwd?: string;
    readonly json?: boolean;
}
export declare function registerMigrateCommand(cli: CAC): void;
export declare function runMigrateSecretsCommand(options?: MigrateSecretsOptions): number;
//# sourceMappingURL=migrate.d.ts.map