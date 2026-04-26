#!/usr/bin/env node
/**
 * `ak` — agent-kit CLI entrypoint.
 *
 * Lazy-loads subcommand modules based on the first argv to keep startup
 * cheap. Modeled on apps/cli-wp/src/cli.ts.
 */
declare const SUPPORTED_COMMANDS: readonly ["blueprint", "symlink", "cursor-windsurf-sync", "audit", "skills", "docs", "setup", "init", "dev", "test", "e2e", "tech-debt", "mcp"];
export { SUPPORTED_COMMANDS };
export declare function main(): Promise<number>;
//# sourceMappingURL=cli.d.ts.map