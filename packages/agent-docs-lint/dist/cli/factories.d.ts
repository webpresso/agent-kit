/**
 * Test factories for CLI dependency mocking.
 * Provides factory functions for creating mocked dependencies in tests.
 */
import type { FileSystem, GlobFunction, Logger, MigratorDeps, ProcessEnv, ValidatorDeps } from './interfaces.js';
/**
 * Creates a fake FileSystem with mock implementations.
 * @param overrides - Optional partial overrides for specific methods
 * @returns Mocked FileSystem instance
 */
export declare function createFakeFs(overrides?: Partial<FileSystem>): FileSystem;
/**
 * Creates a fake Logger with mock implementations.
 * @param overrides - Optional partial overrides for specific methods
 * @returns Mocked Logger instance
 */
export declare function createFakeLogger(overrides?: Partial<Logger>): Logger;
/**
 * Creates a fake ProcessEnv with mock implementations.
 * @param overrides - Optional partial overrides for specific methods
 * @returns Mocked ProcessEnv instance
 */
export declare function createFakeProcess(overrides?: Partial<ProcessEnv>): ProcessEnv;
/**
 * Creates a fake GlobFunction with mock implementation.
 * @param files - Optional array of files to return from glob calls
 * @returns Mocked GlobFunction
 */
export declare function createFakeGlob(files?: string[]): GlobFunction;
/**
 * Creates a complete ValidatorDeps object with all mocked dependencies.
 * Allows granular overrides for specific dependencies or their methods.
 * @param overrides - Optional overrides for fs, logger, process, or glob
 * @returns Complete ValidatorDeps with mocked dependencies
 */
export declare function createValidatorDeps(overrides?: {
    fs?: Partial<FileSystem>;
    logger?: Partial<Logger>;
    process?: Partial<ProcessEnv>;
    glob?: string[];
}): ValidatorDeps;
/**
 * Creates a complete MigratorDeps object with all mocked dependencies.
 * Allows granular overrides for specific dependencies or their methods.
 * @param overrides - Optional overrides for fs, logger, process, or glob
 * @returns Complete MigratorDeps with mocked dependencies
 */
export declare function createMigratorDeps(overrides?: {
    fs?: Partial<FileSystem>;
    logger?: Partial<Logger>;
    process?: Partial<ProcessEnv>;
    glob?: string[];
}): MigratorDeps;
