/**
 * Test factories for CLI dependency mocking.
 * Provides factory functions for creating mocked dependencies in tests.
 */
import { vi } from 'vitest';
/**
 * Creates a fake FileSystem with mock implementations.
 * @param overrides - Optional partial overrides for specific methods
 * @returns Mocked FileSystem instance
 */
export function createFakeFs(overrides) {
    return {
        readFile: vi.fn().mockResolvedValue(''),
        writeFile: vi.fn(async () => { }),
        copyFile: vi.fn(async () => { }),
        existsSync: vi.fn().mockReturnValue(false),
        ...overrides,
    };
}
/**
 * Creates a fake Logger with mock implementations.
 * @param overrides - Optional partial overrides for specific methods
 * @returns Mocked Logger instance
 */
export function createFakeLogger(overrides) {
    return {
        info: vi.fn(),
        success: vi.fn(),
        error: vi.fn(),
        warn: vi.fn(),
        debug: vi.fn(),
        log: vi.fn(),
        ...overrides,
    };
}
/**
 * Creates a fake ProcessEnv with mock implementations.
 * @param overrides - Optional partial overrides for specific methods
 * @returns Mocked ProcessEnv instance
 */
export function createFakeProcess(overrides) {
    return {
        cwd: vi.fn().mockReturnValue('/fake/cwd'),
        exit: vi.fn(),
        execSync: vi.fn().mockReturnValue(''),
        ...overrides,
    };
}
/**
 * Creates a fake GlobFunction with mock implementation.
 * @param files - Optional array of files to return from glob calls
 * @returns Mocked GlobFunction
 */
export function createFakeGlob(files) {
    return vi.fn().mockResolvedValue(files ?? []);
}
/**
 * Creates a complete ValidatorDeps object with all mocked dependencies.
 * Allows granular overrides for specific dependencies or their methods.
 * @param overrides - Optional overrides for fs, logger, process, or glob
 * @returns Complete ValidatorDeps with mocked dependencies
 */
export function createValidatorDeps(overrides) {
    return {
        fs: createFakeFs(overrides?.fs),
        logger: createFakeLogger(overrides?.logger),
        process: createFakeProcess(overrides?.process),
        glob: createFakeGlob(overrides?.glob),
    };
}
/**
 * Creates a complete MigratorDeps object with all mocked dependencies.
 * Allows granular overrides for specific dependencies or their methods.
 * @param overrides - Optional overrides for fs, logger, process, or glob
 * @returns Complete MigratorDeps with mocked dependencies
 */
export function createMigratorDeps(overrides) {
    return {
        fs: createFakeFs(overrides?.fs),
        logger: createFakeLogger(overrides?.logger),
        process: createFakeProcess(overrides?.process),
        glob: createFakeGlob(overrides?.glob),
    };
}
