#!/usr/bin/env bun
/**
 * `wp` — webpresso CLI entrypoint.
 *
 * Lazy-loads subcommand modules based on the first argv to keep startup
 * cheap. Modeled on apps/cli-wp/src/cli.ts.
 */
declare const SUPPORTED_COMMANDS: readonly ["blueprint", "browser", "config", "secrets", "roadmap", "review", "sync", "audit", "qa", "compile", "rule", "skill", "skills", "docs", "setup", "init", "dev", "deploy", "preview", "cleanup", "migrate", "secrets", "doctor", "err", "test", "e2e", "ci", "typecheck", "lint", "format", "logs", "tech-debt", "worktree", "mcp", "hook", "hooks", "gain", "bench", "install", "add", "remove", "update", "exec", "run"];
type RootHelpEntry = {
    readonly command: string;
    readonly description: string;
};
declare const ROOT_HELP_CORE_ENTRIES: readonly RootHelpEntry[];
declare const ROOT_HELP_QUALITY_ENTRIES: readonly RootHelpEntry[];
declare const ROOT_HELP_ADVANCED_ENTRIES: readonly RootHelpEntry[];
export { ROOT_HELP_ADVANCED_ENTRIES, ROOT_HELP_CORE_ENTRIES, ROOT_HELP_QUALITY_ENTRIES, SUPPORTED_COMMANDS, };
export declare function main(): Promise<number>;
//# sourceMappingURL=cli.d.ts.map