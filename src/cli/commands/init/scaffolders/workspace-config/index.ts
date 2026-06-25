/**
 * Workspace config scaffolder.
 *
 * Creates `~/.agent/workspace.yaml` (user-global, never committed) if absent.
 * The file lists local repos for cross-repo correlation lookups.
 *
 * Runs unconditionally on every `wp setup` — not gated behind a --with flag
 * since workspace config is always needed for cross-repo correlation.
 */
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const WORKSPACE_YAML_TEMPLATE = `# ~/.agent/workspace.yaml — user-global workspace config
# Lists local repos for cross-repo correlation lookups
# Never committed to any repo (gitignored by design)
repos: []
  # - path: ~/repos/<org>/<repo-a>
  # - path: ~/repos/<org>/<repo-b>
  # - path: ~/repos/<org>/<consumer-repo>
`;

export function defaultWorkspaceConfigPath(): string {
  return path.join(homedir(), ".agent", "workspace.yaml");
}

/**
 * Creates `~/.agent/workspace.yaml` if absent. Idempotent — second call
 * returns `existing` without touching the file.
 */
export async function scaffoldWorkspaceConfig(opts?: {
  /** Override config path for testing. */
  configPath?: string;
  /** DI seam for fs.existsSync. */
  exists?: typeof existsSync;
  /** DI seam for fs.mkdirSync. */
  mkdir?: typeof mkdirSync;
  /** DI seam for fs.writeFileSync. */
  writeFile?: typeof writeFileSync;
}): Promise<{ action: "created" | "existing" }> {
  const configPath = opts?.configPath ?? defaultWorkspaceConfigPath();
  const _exists = opts?.exists ?? existsSync;
  const _mkdir = opts?.mkdir ?? mkdirSync;
  const _writeFile = opts?.writeFile ?? writeFileSync;

  if (_exists(configPath)) {
    return { action: "existing" };
  }

  _mkdir(path.dirname(configPath), { recursive: true });
  _writeFile(configPath, WORKSPACE_YAML_TEMPLATE, "utf8");
  return { action: "created" };
}
