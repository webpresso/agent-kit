#!/usr/bin/env bun
/**
 * `wp` — webpresso CLI entrypoint.
 *
 * Lazy-loads subcommand modules based on the first argv to keep startup
 * cheap. Modeled on apps/cli-wp/src/cli.ts.
 */
declare const SUPPORTED_COMMANDS: readonly ["blueprint", "config", "roadmap", "sync", "audit", "qa", "compile", "rule", "skill", "skills", "docs", "setup", "init", "dev", "deploy", "doctor", "err", "test", "e2e", "ci", "typecheck", "lint", "format", "tech-debt", "worktree", "mcp", "hook", "hooks", "gain", "bench", "install", "add", "remove", "update", "exec", "run"];
export { SUPPORTED_COMMANDS };
export declare function main(): Promise<number>;
//# sourceMappingURL=cli.d.ts.map