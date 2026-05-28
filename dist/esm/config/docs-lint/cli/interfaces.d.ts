/**
 * Dependency interfaces for testable CLI commands.
 * Enables dependency injection and mocking in tests.
 */
/**
 * Filesystem operations abstraction.
 */
export interface FileSystem {
    readFile(path: string): Promise<string>;
    writeFile(path: string, content: string): Promise<void>;
    copyFile(src: string, dest: string): Promise<void>;
    existsSync(path: string): boolean;
}
/**
 * Glob function signature.
 */
export type GlobFunction = (patterns: string[], options: unknown) => Promise<string[]>;
/**
 * Logger abstraction (no spinners - direct output only).
 */
export interface Logger {
    info(msg: string): void;
    success(msg: string): void;
    error(msg: string): void;
    warn(msg: string): void;
    debug(msg: string): void;
    log(msg: string): void;
}
/**
 * Process environment abstraction.
 */
export interface ProcessEnv {
    cwd(): string;
    exit(code: number): void;
    execSync(cmd: string, opts: unknown): string;
}
/**
 * Dependencies for ValidateCommand.
 */
export interface ValidatorDeps {
    fs: FileSystem;
    logger: Logger;
    process: ProcessEnv;
    glob: GlobFunction;
}
/**
 * Dependencies for MigrateCommand.
 */
export interface MigratorDeps {
    fs: FileSystem;
    logger: Logger;
    process: ProcessEnv;
    glob: GlobFunction;
}
//# sourceMappingURL=interfaces.d.ts.map