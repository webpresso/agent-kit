/**
 * Test factories for CLI dependency mocking.
 * Provides factory functions for creating mocked dependencies in tests.
 */

import type {
  FileSystem,
  GlobFunction,
  Logger,
  MigratorDeps,
  ProcessEnv,
  ValidatorDeps,
} from "./interfaces.js";

import { vi } from "vitest";

/**
 * Creates a fake FileSystem with mock implementations.
 * @param overrides - Optional partial overrides for specific methods
 * @returns Mocked FileSystem instance
 */
export function createFakeFs(overrides?: Partial<FileSystem>): FileSystem {
  return {
    readFile: vi.fn<FileSystem["readFile"]>().mockResolvedValue(""),
    writeFile: vi.fn<FileSystem["writeFile"]>(async () => {}),
    copyFile: vi.fn<FileSystem["copyFile"]>(async () => {}),
    existsSync: vi.fn<FileSystem["existsSync"]>().mockReturnValue(false),
    ...overrides,
  };
}

/**
 * Creates a fake Logger with mock implementations.
 * @param overrides - Optional partial overrides for specific methods
 * @returns Mocked Logger instance
 */
export function createFakeLogger(overrides?: Partial<Logger>): Logger {
  return {
    info: vi.fn<Logger["info"]>(),
    success: vi.fn<Logger["success"]>(),
    error: vi.fn<Logger["error"]>(),
    warn: vi.fn<Logger["warn"]>(),
    debug: vi.fn<Logger["debug"]>(),
    log: vi.fn<Logger["log"]>(),
    ...overrides,
  };
}

/**
 * Creates a fake ProcessEnv with mock implementations.
 * @param overrides - Optional partial overrides for specific methods
 * @returns Mocked ProcessEnv instance
 */
export function createFakeProcess(overrides?: Partial<ProcessEnv>): ProcessEnv {
  return {
    cwd: vi.fn<ProcessEnv["cwd"]>().mockReturnValue("/fake/cwd"),
    exit: vi.fn<ProcessEnv["exit"]>(),
    execSync: vi.fn<ProcessEnv["execSync"]>().mockReturnValue(""),
    ...overrides,
  };
}

/**
 * Creates a fake GlobFunction with mock implementation.
 * @param files - Optional array of files to return from glob calls
 * @returns Mocked GlobFunction
 */
export function createFakeGlob(files?: string[]): GlobFunction {
  return vi.fn<GlobFunction>().mockResolvedValue(files ?? []);
}

/**
 * Creates a complete ValidatorDeps object with all mocked dependencies.
 * Allows granular overrides for specific dependencies or their methods.
 * @param overrides - Optional overrides for fs, logger, process, or glob
 * @returns Complete ValidatorDeps with mocked dependencies
 */
export function createValidatorDeps(overrides?: {
  fs?: Partial<FileSystem>;
  logger?: Partial<Logger>;
  process?: Partial<ProcessEnv>;
  glob?: string[];
}): ValidatorDeps {
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
export function createMigratorDeps(overrides?: {
  fs?: Partial<FileSystem>;
  logger?: Partial<Logger>;
  process?: Partial<ProcessEnv>;
  glob?: string[];
}): MigratorDeps {
  return {
    fs: createFakeFs(overrides?.fs),
    logger: createFakeLogger(overrides?.logger),
    process: createFakeProcess(overrides?.process),
    glob: createFakeGlob(overrides?.glob),
  };
}
