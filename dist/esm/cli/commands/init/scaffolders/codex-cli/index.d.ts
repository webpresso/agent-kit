import { spawnSync } from 'node:child_process';
import type { MergeOptions } from '#cli/commands/init/merge';
export interface EnsureCodexCliInput {
    options: MergeOptions;
    spawn?: typeof spawnSync;
    resolveVpCommand?: () => string | null;
}
export type EnsureCodexCliResult = {
    kind: 'codex-cli-ok';
    installed: boolean;
} | {
    kind: 'codex-cli-skipped-dry-run';
} | {
    kind: 'codex-cli-unavailable';
    hint: string;
};
export declare function ensureCodexCli(input: EnsureCodexCliInput): EnsureCodexCliResult;
//# sourceMappingURL=index.d.ts.map