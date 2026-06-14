import type { HooksMap } from '#cli/commands/init/scaffolders/agent-hooks/ir.js';
export type InstalledHookVendor = 'claude' | 'codex';
export declare function resolveInstalledHooksPath(repoRoot: string, vendor: InstalledHookVendor): string;
export declare function readInstalledHooksMap(repoRoot: string, vendor: InstalledHookVendor): HooksMap;
//# sourceMappingURL=installed-hooks.d.ts.map