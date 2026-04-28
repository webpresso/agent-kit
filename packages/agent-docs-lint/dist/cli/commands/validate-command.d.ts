import type { ValidatorDeps } from '#cli/interfaces';
export interface ValidateOptions {
    files?: string[];
    staged?: boolean;
    fix?: boolean;
    verbose?: boolean;
}
export declare class ValidateCommand {
    private deps;
    constructor(deps: ValidatorDeps);
    run(options: ValidateOptions): Promise<number>;
    private getFilesToValidate;
    private validateFiles;
    private validateFile;
    private resolveDocType;
    private validateFrontmatter;
    private validateFrontmatterSchema;
    private zodErrorsToValidationErrors;
    private validateRequiredSections;
    private runContentValidators;
    private partitionBySeverity;
    private mergeResults;
    private formatError;
    private formatFileResults;
    private formatResults;
}
export declare function createValidateCommand(): ValidateCommand;
