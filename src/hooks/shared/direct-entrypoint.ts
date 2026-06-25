import { realpathSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * Return true when a module is being executed directly rather than imported.
 *
 * Bun single-file executables expose virtual `/$bunfs/...` paths while loading
 * bundled modules. Those paths are not real filesystem entries, so direct
 * `realpathSync` checks must degrade instead of throwing during native runtime
 * imports.
 */
export function isDirectEntrypoint(moduleUrl: string, argvPath = process.argv[1]): boolean {
  if (!argvPath) return false;

  try {
    return realpathSync(fileURLToPath(moduleUrl)) === realpathSync(argvPath);
  } catch {
    return false;
  }
}
