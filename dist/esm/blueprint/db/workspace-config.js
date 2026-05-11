import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { load as yamlLoad } from 'js-yaml';
import { z } from 'zod';
const workspaceRepoSchema = z.object({
    path: z.string(),
});
const workspaceConfigSchema = z.object({
    repos: z.array(workspaceRepoSchema).default([]),
});
export function defaultWorkspaceConfigPath() {
    return path.join(homedir(), '.agent', 'workspace.yaml');
}
/**
 * Read `~/.agent/workspace.yaml`, parse with js-yaml, and validate with Zod.
 * Returns an empty `{ repos: [] }` config if the file is missing or invalid.
 */
export function loadWorkspaceConfig(configPath) {
    const target = configPath ?? defaultWorkspaceConfigPath();
    if (!existsSync(target)) {
        return workspaceConfigSchema.parse({});
    }
    try {
        const raw = readFileSync(target, 'utf8');
        const parsed = yamlLoad(raw);
        return workspaceConfigSchema.parse(parsed ?? {});
    }
    catch {
        return workspaceConfigSchema.parse({});
    }
}
/**
 * Returns expanded absolute paths from `~/.agent/workspace.yaml`.
 * Expands leading `~` using `os.homedir()`.
 */
export function getWorkspaceRepos(configPath) {
    const config = loadWorkspaceConfig(configPath);
    return config.repos.map((repo) => expandHome(repo.path));
}
function expandHome(repoPath) {
    if (repoPath.startsWith('~/') || repoPath === '~') {
        return path.join(homedir(), repoPath.slice(2));
    }
    return repoPath;
}
/**
 * Ensure `~/.agent/` directory exists. Used during workspace config
 * initialisation. Safe on all platforms via `mkdirSync` with `recursive`.
 */
export function ensureAgentDir(agentDir) {
    const target = agentDir ?? path.join(homedir(), '.agent');
    mkdirSync(target, { recursive: true });
}
// ---------------------------------------------------------------------------
// Workspace repo ingestion into SQLite
// ---------------------------------------------------------------------------
/**
 * Reads `~/.agent/workspace.yaml`, resolves each repo path, detects its
 * organization (via `git remote get-url origin`) and visibility (via
 * `gh repo view`), and upserts the results into the `workspace_repos` table.
 *
 * Silent on individual repo failures so one bad remote doesn't abort the run.
 */
export function ingestWorkspaceRepos(db, cwd) {
    const repos = getWorkspaceRepos();
    const upsert = db.prepare(`INSERT INTO workspace_repos (repo_path, organization, repo_name, visibility, last_synced)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(repo_path) DO UPDATE SET
       organization = excluded.organization,
       repo_name    = excluded.repo_name,
       visibility   = excluded.visibility,
       last_synced  = excluded.last_synced`);
    const now = Date.now();
    for (const repoPath of repos) {
        try {
            const org = detectOrgFromPath(repoPath);
            const repoName = detectRepoNameFromPath(repoPath);
            const visibility = detectVisibilityFromPath(repoPath);
            upsert.run(repoPath, org, repoName, visibility, now);
        }
        catch {
            // Skip repos we can't inspect — don't fail the whole ingest
        }
    }
    // Also upsert the current working directory repo
    try {
        const org = detectOrgFromPath(cwd);
        const repoName = detectRepoNameFromPath(cwd);
        const visibility = detectVisibilityFromPath(cwd);
        upsert.run(cwd, org, repoName, visibility, now);
    }
    catch {
        // Best-effort
    }
}
function detectOrgFromPath(repoPath) {
    try {
        const remote = execSync('git remote get-url origin', {
            cwd: repoPath,
            stdio: ['ignore', 'pipe', 'ignore'],
            encoding: 'utf8',
            timeout: 5000,
        }).trim();
        const match = remote.match(/[:/]([^/]+)\/[^/]+(?:\.git)?$/);
        if (match?.[1])
            return match[1];
    }
    catch {
        // silent
    }
    return 'unknown';
}
function detectRepoNameFromPath(repoPath) {
    try {
        const remote = execSync('git remote get-url origin', {
            cwd: repoPath,
            stdio: ['ignore', 'pipe', 'ignore'],
            encoding: 'utf8',
            timeout: 5000,
        }).trim();
        // Extract repo name from "org/repo.git" or "org/repo"
        const match = remote.match(/\/([^/]+?)(?:\.git)?$/);
        if (match?.[1])
            return match[1];
    }
    catch {
        // silent
    }
    return path.basename(repoPath);
}
function detectVisibilityFromPath(repoPath) {
    try {
        const result = execSync('gh repo view --json visibility --jq .visibility', {
            cwd: repoPath,
            stdio: ['ignore', 'pipe', 'ignore'],
            encoding: 'utf8',
            timeout: 10000,
        }).trim();
        if (result.toLowerCase() === 'public')
            return 'public';
    }
    catch {
        // silent — gh not available or not authenticated
    }
    return 'private';
}
//# sourceMappingURL=workspace-config.js.map