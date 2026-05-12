import Database from 'better-sqlite3';
import { z } from 'zod';
declare const workspaceRepoSchema: z.ZodObject<{
    path: z.ZodString;
}, z.core.$strip>;
declare const workspaceConfigSchema: z.ZodObject<{
    repos: z.ZodDefault<z.ZodArray<z.ZodObject<{
        path: z.ZodString;
    }, z.core.$strip>>>;
}, z.core.$strip>;
export type WorkspaceRepo = z.infer<typeof workspaceRepoSchema>;
export type WorkspaceConfig = z.infer<typeof workspaceConfigSchema>;
export declare function defaultWorkspaceConfigPath(): string;
/**
 * Read `~/.agent/workspace.yaml`, parse with js-yaml, and validate with Zod.
 * Returns an empty `{ repos: [] }` config if the file is missing or invalid.
 */
export declare function loadWorkspaceConfig(configPath?: string): WorkspaceConfig;
/**
 * Returns expanded absolute paths from `~/.agent/workspace.yaml`.
 * Expands leading `~` using `os.homedir()`.
 */
export declare function getWorkspaceRepos(configPath?: string): string[];
/**
 * Ensure `~/.agent/` directory exists. Used during workspace config
 * initialisation. Safe on all platforms via `mkdirSync` with `recursive`.
 */
export declare function ensureAgentDir(agentDir?: string): void;
/**
 * Reads `~/.agent/workspace.yaml`, resolves each repo path, detects its
 * organization (via `git remote get-url origin`) and visibility (via
 * `gh repo view`), and upserts the results into the `workspace_repos` table.
 *
 * Silent on individual repo failures so one bad remote doesn't abort the run.
 */
export declare function ingestWorkspaceRepos(db: Database.Database, cwd: string): void;
export {};
//# sourceMappingURL=workspace-config.d.ts.map