import { existsSync, readFileSync } from "node:fs";
import { isAbsolute, join, posix, win32 } from "node:path";
import { fileURLToPath } from "node:url";

import { pathCandidates } from "#runtime/command-exists.js";

// The compiled `wp` runtime ships as a native sub-dependency named
// `@webpresso/agent-kit-runtime-<os>-<cpu>`. It legitimately carries a native
// `bin/wp` payload but is NOT the agent-kit package root: it has no
// `.claude-plugin/plugin.json` and its `bin/wp` is not the JS selector. Reject
// it so resolution walks up to the real `@webpresso/agent-kit` package instead
// of stopping one level too early.
const RUNTIME_PAYLOAD_NAME_PATTERN = /^@webpresso\/agent-kit-runtime-/u;

function isRuntimePayloadPackage(dir: string): boolean {
  try {
    const parsed = JSON.parse(readFileSync(join(dir, "package.json"), "utf8")) as {
      readonly name?: unknown;
    };
    return typeof parsed.name === "string" && RUNTIME_PAYLOAD_NAME_PATTERN.test(parsed.name);
  } catch {
    return false;
  }
}

export interface ResolveAgentKitPackageRootOptions {
  readonly moduleUrl?: string;
  readonly execPath?: string;
  readonly argv0?: string;
  readonly argv1?: string;
  readonly pathEnv?: string;
  readonly pathExtEnv?: string;
  readonly platform?: NodeJS.Platform;
  readonly requireCatalog?: boolean;
}

function existingModulePath(moduleUrl: string | undefined): string | null {
  if (typeof moduleUrl !== "string" || moduleUrl.length === 0) return null;
  try {
    return fileURLToPath(moduleUrl);
  } catch {
    return null;
  }
}

function isRunnablePath(path: string | undefined): path is string {
  if (typeof path !== "string" || path.length === 0) return false;
  return isAbsolute(path) || win32.isAbsolute(path) || path.includes("/") || path.includes("\\");
}

function pathModuleForPlatform(platform: NodeJS.Platform): typeof posix | typeof win32 {
  return platform === "win32" ? win32 : posix;
}

// Locate an installed bin on PATH using the `exists` predicate: the first
// candidate that is present on disk wins. This is deliberately weaker than
// `#runtime/command-exists`'s `runnable` predicate — the doctor resolves npm
// shims (e.g. `wp.cmd`) that may not carry an exec bit. The cross-platform
// PATH + PATHEXT enumeration is shared via `pathCandidates` so it lives in one
// place; only the predicate differs.
function resolveBinOnPath(
  binName: string,
  pathEnv: string | undefined,
  options: { readonly pathExtEnv?: string; readonly platform?: NodeJS.Platform } = {},
): string | null {
  if (binName.length === 0 || typeof pathEnv !== "string" || pathEnv.length === 0) return null;
  for (const candidate of pathCandidates(binName, {
    pathEnv,
    platform: options.platform,
    pathExtEnv: options.pathExtEnv,
  })) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

export function isAgentKitPackageRoot(
  dir: string,
  options: { readonly requireCatalog?: boolean } = {},
): boolean {
  if (!existsSync(join(dir, "package.json"))) return false;
  if (options.requireCatalog === true && !existsSync(join(dir, "catalog"))) return false;
  if (isRuntimePayloadPackage(dir)) return false;

  return (
    existsSync(join(dir, "bin", "wp")) ||
    existsSync(join(dir, "bin", "wp.cmd")) ||
    existsSync(join(dir, "bin", "wp.exe")) ||
    existsSync(join(dir, ".claude-plugin", "plugin.json")) ||
    existsSync(join(dir, "src", "cli", "cli.ts")) ||
    existsSync(join(dir, "dist", "esm", "cli", "cli.js"))
  );
}

export function findAgentKitPackageRoot(
  startPath: string | undefined,
  options: { readonly requireCatalog?: boolean; readonly platform?: NodeJS.Platform } = {},
): string | null {
  if (!isRunnablePath(startPath)) return null;

  const platform = options.platform ?? process.platform;
  const pathModule = pathModuleForPlatform(platform);
  let dir = pathModule.dirname(startPath);
  for (let depth = 0; depth < 10; depth++) {
    if (isAgentKitPackageRoot(dir, options)) return dir;
    const parent = pathModule.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return null;
}

export function resolveAgentKitPackageRoot(
  options: ResolveAgentKitPackageRootOptions = {},
): string | null {
  const modulePath = existingModulePath(options.moduleUrl ?? import.meta.url);
  const execPath = options.execPath ?? process.execPath;
  const argv0 = options.argv0 ?? process.argv[0];
  const argv1 = options.argv1 ?? process.argv[1];
  const pathEnv = options.pathEnv ?? process.env.PATH;
  const platform = options.platform ?? process.platform;
  const pathModule = pathModuleForPlatform(platform);
  const pathResolvedBin = resolveBinOnPath(pathModule.basename(argv0 || "wp"), pathEnv, {
    pathExtEnv: options.pathExtEnv,
    platform,
  });
  const requireCatalog = options.requireCatalog;

  for (const startPath of [modulePath, argv1, execPath, pathResolvedBin, argv0]) {
    const root = findAgentKitPackageRoot(startPath ?? undefined, { requireCatalog, platform });
    if (root) return root;
  }
  return null;
}

export function resolveAgentKitPackageRootOrThrow(
  errorMessage: string,
  options: ResolveAgentKitPackageRootOptions = {},
): string {
  const root = resolveAgentKitPackageRoot(options);
  if (root) return root;
  throw new Error(errorMessage);
}
