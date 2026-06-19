import { spawnSync } from 'node:child_process';
import type { MergeOptions } from '#cli/commands/init/merge';
import { type GlobalCapableVpCommandInput } from '#cli/global-vp.js';
export interface EnsureCodexCliInput {
    options: MergeOptions;
    spawn?: typeof spawnSync;
    env?: NodeJS.ProcessEnv;
    resolveVpCommand?: () => GlobalCapableVpCommandInput | null;
}
export type EnsureCodexCliResult = {
    kind: 'codex-cli-ok';
    installed: boolean;
} | {
    kind: 'codex-cli-skipped-dry-run';
} | {
    kind: 'codex-cli-skipped-package-lifecycle';
} | {
    kind: 'codex-cli-unavailable';
    hint: string;
};
export declare function ensureCodexCli(input: EnsureCodexCliInput): EnsureCodexCliResult;
//# sourceMappingURL=index.d.ts.map