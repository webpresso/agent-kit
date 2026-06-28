/**
 * Workspace-local command/binary resolution for consumer deploy/e2e scripts.
 * Command/env resolution (distinct from repo-root discovery).
 */
import { join } from "node:path";

/** Resolve a workspace-local binary: `<repoRoot>/node_modules/.bin/<name>`. */
export function resolveWorkspaceBinary(repoRoot: string, binaryName: string): string {
  return join(repoRoot, "node_modules", ".bin", binaryName);
}

/** Resolve the workspace-local `vp` runner binary. */
export function resolveVpCommand(repoRoot: string): string {
  return resolveWorkspaceBinary(repoRoot, "vp");
}

/**
 * A child-process env with the workspace-local `node_modules/.bin` prepended to
 * `PATH`, so spawned tools resolve workspace binaries first.
 */
export function buildChildEnv(
  repoRoot: string,
  env: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const localBin = join(repoRoot, "node_modules", ".bin");
  return { ...env, PATH: env.PATH ? `${localBin}:${env.PATH}` : localBin };
}
