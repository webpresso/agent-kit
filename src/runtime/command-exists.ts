import { accessSync, constants, statSync } from "node:fs";
import { join, posix, win32 } from "node:path";

/**
 * Cross-platform `command exists and is runnable` check.
 *
 * Replaces the `spawnSync('which', [cmd])` pattern that was copy-pasted across the
 * init scaffolders and `runners/select.ts`. That pattern is POSIX-only (`which` does
 * not exist on Windows, which uses `where`), so every check returned false on win32
 * even when the binary was installed. It also spawned a subprocess per call.
 *
 * This module scans `PATH` (+ `PATHEXT` on win32) directly — no subprocess — and is
 * pure given injected `platform`/`pathEnv`/`pathExtEnv`, so it is deterministically
 * unit-testable for both posix and win32 without touching the host PATH.
 *
 * Predicate is **runnable**, matching `which`: a candidate counts only if it is a
 * regular file that is executable (posix `X_OK`). A directory or non-executable file
 * named like the command is not a match. (`package-root.ts:resolveBinOnPath` keeps a
 * separate `exists` predicate for locating npm shims — a different question.)
 */
export interface CommandLookupOptions {
  readonly platform?: NodeJS.Platform;
  readonly pathEnv?: string;
  readonly pathExtEnv?: string;
}

function pathModuleForPlatform(platform: NodeJS.Platform): typeof posix | typeof win32 {
  return platform === "win32" ? win32 : posix;
}

function pathDelimiterForPlatform(platform: NodeJS.Platform): string {
  return platform === "win32" ? ";" : ":";
}

function commandNameVariants(
  command: string,
  platform: NodeJS.Platform,
  pathExtEnv: string | undefined,
): string[] {
  // Only win32 appends extensions, and only when the command has none already.
  if (platform !== "win32" || /\.[^./\\]+$/u.test(command)) return [command];
  const extensions =
    typeof pathExtEnv === "string" && pathExtEnv.length > 0
      ? pathExtEnv
          .split(";")
          .map((entry) => entry.trim())
          .filter((entry) => entry.length > 0)
          .map((entry) => entry.toLowerCase())
      : [".exe", ".cmd", ".bat"];
  return [command, ...extensions.map((extension) => `${command}${extension}`)];
}

/**
 * Enumerate every candidate filesystem path for `command` across all `PATH` entries,
 * cross-platform (win32 PATHEXT-aware). Pure — no filesystem or subprocess access.
 * Both the platform-specific join and the host-default join are emitted so a win32
 * simulation still resolves real fixtures on a posix test filesystem.
 */
export function pathCandidates(command: string, options: CommandLookupOptions = {}): string[] {
  if (command.length === 0) return [];
  const platform = options.platform ?? process.platform;
  const pathEnv = options.pathEnv ?? process.env.PATH;
  if (typeof pathEnv !== "string" || pathEnv.length === 0) return [];
  const pathExtEnv = options.pathExtEnv ?? process.env.PATHEXT;
  const pathModule = pathModuleForPlatform(platform);
  const variants = commandNameVariants(command, platform, pathExtEnv);

  const candidates: string[] = [];
  for (const entry of pathEnv.split(pathDelimiterForPlatform(platform))) {
    if (entry.length === 0) continue;
    for (const variant of variants) {
      for (const candidate of new Set([pathModule.join(entry, variant), join(entry, variant)])) {
        candidates.push(candidate);
      }
    }
  }
  return candidates;
}

function isRunnableFile(path: string, platform: NodeJS.Platform): boolean {
  let stat: ReturnType<typeof statSync>;
  try {
    stat = statSync(path);
  } catch {
    return false;
  }
  if (!stat.isFile()) return false;
  // Windows has no executable bit; presence of the right-extension file is enough.
  if (platform === "win32") return true;
  try {
    accessSync(path, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Cross-platform check for whether `command` resolves to a runnable executable on
 * `PATH`. Never spawns a subprocess. See the module doc for the predicate contract.
 */
export function commandExists(command: string, options: CommandLookupOptions = {}): boolean {
  const platform = options.platform ?? process.platform;
  for (const candidate of pathCandidates(command, options)) {
    if (isRunnableFile(candidate, platform)) return true;
  }
  return false;
}
