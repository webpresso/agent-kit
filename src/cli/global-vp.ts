import { accessSync, constants, existsSync, realpathSync, statSync } from "node:fs";
import { delimiter, sep } from "node:path";

import { pathCandidates } from "#runtime/command-exists.js";

export interface GlobalCapableVpCommand {
  readonly command: string;
  readonly argsPrefix: readonly string[];
  readonly executable: string;
}

export type GlobalCapableVpCommandInput = string | GlobalCapableVpCommand;

export function appendGlobalCapableVpArgs(
  vpCommand: GlobalCapableVpCommandInput,
  args: readonly string[],
): [string, ...string[]] {
  if (typeof vpCommand === "string") return [vpCommand, ...args];
  return [vpCommand.command, ...vpCommand.argsPrefix, ...args];
}

function splitPathSegments(value: string): string[] {
  const normalized = value.replace(/\\/g, sep);
  const stripped = normalized.startsWith(sep) ? normalized.slice(sep.length) : normalized;
  return stripped.split(sep).filter((segment) => segment.length > 0 && segment !== delimiter);
}

function hasSegmentPair(segments: readonly string[], left: string, right: string): boolean {
  return segments.some((segment, index) => segment === left && segments[index + 1] === right);
}

function isProjectNodeModulesCandidate(value: string): boolean {
  const segments = splitPathSegments(value);
  return segments.includes("node_modules") && !segments.includes(".vite-plus");
}

function isRuntimeLocalVitePlusCandidate(value: string): boolean {
  return hasSegmentPair(splitPathSegments(value), ".vite-plus", "js_runtime");
}

function isRejectedVpCandidate(candidatePath: string, realpath: string): boolean {
  return (
    isProjectNodeModulesCandidate(candidatePath) ||
    isProjectNodeModulesCandidate(realpath) ||
    isRuntimeLocalVitePlusCandidate(candidatePath) ||
    isRuntimeLocalVitePlusCandidate(realpath)
  );
}

function executableRealpath(candidate: string, platformValue: NodeJS.Platform): string | null {
  try {
    if (!existsSync(candidate)) return null;
    const stat = statSync(candidate);
    if (!stat.isFile()) return null;
    if (platformValue !== "win32") accessSync(candidate, constants.X_OK);
    return realpathSync(candidate);
  } catch {
    return null;
  }
}

function isWindowsCommandScript(path: string): boolean {
  return /\.(?:cmd|bat)$/iu.test(path);
}

function commandForRealpath(
  realpath: string,
  platformValue: NodeJS.Platform,
  env: NodeJS.ProcessEnv,
): GlobalCapableVpCommand {
  if (platformValue === "win32" && isWindowsCommandScript(realpath)) {
    return {
      command: env["ComSpec"] ?? env["COMSPEC"] ?? "cmd.exe",
      argsPrefix: ["/d", "/s", "/c", realpath],
      executable: realpath,
    };
  }
  return { command: realpath, argsPrefix: [], executable: realpath };
}

export function resolveGlobalCapableVpCommand(
  pathValue: string = process.env.PATH ?? "",
  platformValue: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): GlobalCapableVpCommand | null {
  for (const candidate of pathCandidates("vp", { pathEnv: pathValue, platform: platformValue })) {
    const realpath = executableRealpath(candidate, platformValue);
    if (realpath === null) continue;
    if (isRejectedVpCandidate(candidate, realpath)) continue;
    return commandForRealpath(realpath, platformValue, env);
  }
  return null;
}

export function resolveGlobalCapableVp(
  pathValue: string = process.env.PATH ?? "",
  platformValue: NodeJS.Platform = process.platform,
): string | null {
  return resolveGlobalCapableVpCommand(pathValue, platformValue)?.executable ?? null;
}
