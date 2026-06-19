import type { MigratorDeps } from '#config/docs-lint/cli/interfaces';
export interface MigrateOptions {
    files?: string[];
    dryRun?: boolean;
    backup?: boolean;
    verbose?: boolean;
    force?: boolean;
}
export declare class MigrateCommand {
    private deps;
    constructor(deps: MigratorDeps);
    run(options: MigrateOptions): Promise<number>;
    private getFilesToMigrate;
    private migrateFile;
    private createSkippedResult;
    private extractExistingMetadata;
    private handleDryRun;
    private handleBackup;
    private formatResults;
}
export declare function createMigrateCommand(deps?: MigratorDeps): MigrateCommand;
//# sourceMappingURL=migrate-command.d.ts.map