/**
 * Webpresso-owned curated gstack-derived skill installer.
 *
 * V1 no longer clones or pulls the upstream checkout. It copies allowlisted,
 * provenance-backed Markdown skill sources shipped with @webpresso/agent-kit
 * into user skill roots. Removing an old external checkout is explicit only.
 */
import { existsSync, mkdirSync, cpSync, renameSync, rmSync, readFileSync, writeFileSync } from 'node:fs';
import type { MergeOptions } from '#cli/commands/init/merge';
import { type GstackSkillCollision } from './collision-audit.js';
export interface EnsureGstackInput {
    repoRoot: string;
    options: MergeOptions;
    /** Legacy external checkout path, used only for explicit cleanup. */
    installRoot?: string;
    claudeSkillsRoot?: string;
    codexConfigPath?: string;
    codexSkillsRoot?: string;
    packageRoot?: string | null;
    exists?: typeof existsSync;
    mkdir?: typeof mkdirSync;
    readFile?: typeof readFileSync;
    writeFile?: typeof writeFileSync;
    cp?: typeof cpSync;
    rename?: typeof renameSync;
    rm?: typeof rmSync;
    detectCodex?: (input: {
        exists: typeof existsSync;
        codexConfigPath: string;
    }) => boolean;
    env?: NodeJS.ProcessEnv;
    log?: (message: string) => void;
    now?: () => number;
}
export type GstackCodexResult = {
    kind: 'gstack-codex-installed';
    skillsRoot: string;
} | {
    kind: 'gstack-codex-updated';
    skillsRoot: string;
} | {
    kind: 'gstack-codex-already-configured';
    skillsRoot: string;
} | {
    kind: 'gstack-codex-skipped';
    reason: 'not-detected' | 'not-requested';
    skillsRoot: string;
};
export type EnsureGstackResult = {
    kind: 'gstack-installed';
    root: string;
    codex: GstackCodexResult;
    collisions?: GstackSkillCollision[];
} | {
    kind: 'gstack-updated';
    root: string;
    codex: GstackCodexResult;
    collisions?: GstackSkillCollision[];
} | {
    kind: 'gstack-already-configured';
    root: string;
    codex: GstackCodexResult;
    collisions?: GstackSkillCollision[];
} | {
    kind: 'gstack-skipped-dry-run';
} | {
    kind: 'gstack-setup-failed';
    command: 'webpresso-skill-install';
    exitCode: number;
    reason: 'collision' | 'missing-package-assets' | 'exit-nonzero' | 'inactivity-timeout' | 'signal-interrupted';
    logPath: string;
    collisions?: GstackSkillCollision[];
};
export declare function cleanupExternalGstackCheckout(input: {
    externalRoot: string;
    dryRun: boolean;
    explicit: boolean;
    exists?: typeof existsSync;
    mkdir?: typeof mkdirSync;
    rename?: typeof renameSync;
    rm?: typeof rmSync;
    now?: () => number;
    backupRoot?: string;
}): {
    kind: 'skipped-not-present' | 'refused' | 'dry-run' | 'backed-up';
    backupPath?: string;
    path: string;
};
export declare function ensureGstack(input: EnsureGstackInput): Promise<EnsureGstackResult>;
//# sourceMappingURL=index.d.ts.map