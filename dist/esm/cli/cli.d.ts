#!/usr/bin/env bun
/**
 * `ak` — agent-kit CLI entrypoint.
 *
 * Lazy-loads subcommand modules based on the first argv to keep startup
 * cheap. Modeled on apps/cli-wp/src/cli.ts.
 */
declare const SUPPORTED_COMMANDS: readonly ["blueprint", "roadmap", "symlink", "cursor-windsurf-sync", "audit", "skills", "docs", "setup", "init", "dev", "test", "e2e", "tech-debt", "mcp", "hooks"];
export { SUPPORTED_COMMANDS };
export declare function main(): Promise<number>;
//# sourceMappingURL=cli.d.ts.map