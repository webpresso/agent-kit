#!/usr/bin/env bun
/**
 * `ak` — agent-kit CLI entrypoint.
 *
 * Lazy-loads subcommand modules based on the first argv to keep startup
 * cheap. Modeled on apps/cli-wp/src/cli.ts.
 */
declare const SUPPORTED_COMMANDS: readonly ["blueprint", "roadmap", "sync", "audit", "compile", "rule", "skill", "skills", "docs", "setup", "init", "dev", "doctor", "err", "test", "e2e", "lint", "format", "tech-debt", "worktree", "mcp", "hooks", "gain"];
export { SUPPORTED_COMMANDS };
export declare function main(): Promise<number>;
//# sourceMappingURL=cli.d.ts.map