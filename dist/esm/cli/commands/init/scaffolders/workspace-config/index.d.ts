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
export declare function defaultWorkspaceConfigPath(): string;
/**
 * Creates `~/.agent/workspace.yaml` if absent. Idempotent — second call
 * returns `existing` without touching the file.
 */
export declare function scaffoldWorkspaceConfig(opts?: {
    /** Override config path for testing. */
    configPath?: string;
    /** DI seam for fs.existsSync. */
    exists?: typeof existsSync;
    /** DI seam for fs.mkdirSync. */
    mkdir?: typeof mkdirSync;
    /** DI seam for fs.writeFileSync. */
    writeFile?: typeof writeFileSync;
}): Promise<{
    action: "created" | "existing";
}>;
//# sourceMappingURL=index.d.ts.map