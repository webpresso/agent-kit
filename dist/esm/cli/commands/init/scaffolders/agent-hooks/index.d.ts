import { type MergeOptions, type MergeResult } from '#cli/commands/init/merge';
import { type ResolveAgentKitPackageRootOptions } from '#cli/commands/init/package-root';
import type { CodexAppServerApi } from '#codex/app-server/types.js';
import { type SyncCodexHookTrustResult } from './codex-trust-sync.js';
import type { HooksManifest } from './manifest.js';
import { type HooksMap, type MatcherSet } from './ir.js';
export type { MatcherSet } from './ir.js';
type WebpressoHookBinClassification = {
    kind: 'canonical';
    binName: string;
} | {
    kind: 'legacy';
    binName: string;
};
export declare function classifyWebpressoHookBin(binName: string | null): WebpressoHookBinClassification | null;
/**
 * Construct the canonical wp-* hook groups (SessionStart, PreToolUse,
 * PostToolUse, UserPromptSubmit, Stop). Delegates to buildClaudeHookGroups
 * in emitters/claude.ts which reads from WP_HOOK_SPECS in ir.ts.
 *
 * Kept exported for backward compatibility — callers should prefer
 * buildClaudeHookGroups directly.
 */
export declare function buildWebpressoHookGroups(input: {
    resolveBin: (name: string) => string;
    matchers: MatcherSet;
}): HooksMap;
/**
 * Migration: Codex's canonical hooks.json schema is wrapped under a top-level
 * `hooks` key (matching Codex's official docs at
 * https://developers.openai.com/codex/hooks). Earlier versions of this
 * scaffolder wrote event keys at the top level, which Codex silently ignored.
 *
 * Move any top-level `SessionStart|PreToolUse|PostToolUse|UserPromptSubmit|Stop`
 * keys into `json.hooks`, deduping via `ensureGroup`, and delete the
 * legacy top-level keys. Idempotent.
 */
export declare function hoistTopLevelEvents(json: Record<string, unknown>): Record<string, unknown>;
export type CodexTrustSyncWarning = {
    readonly kind: 'codex-app-server-trust-sync-warning';
    readonly message: string;
    readonly syncResult?: SyncCodexHookTrustResult;
};
type CodexAppServerFactory = (repoRoot: string) => Promise<CodexAppServerApi>;
export declare function trustCodexWebpressoHooksForRepo(input: ScaffoldAgentHooksInput): Promise<void>;
export declare function trustCodexPresetHooksForUser(input: ScaffoldAgentHooksInput): Promise<void>;
export interface ScaffoldAgentHooksInput {
    repoRoot: string;
    options: MergeOptions;
    createCodexAppServer?: CodexAppServerFactory;
    onCodexTrustSyncWarning?: (warning: CodexTrustSyncWarning) => void;
    trustCodexHooks?: boolean;
    /**
     * Injectable PATH probe for the `codex` binary. Defaults to a real `which`
     * check. When a `createCodexAppServer` factory is injected (tests), codex is
     * assumed available unless this is set explicitly.
     */
    codexAvailable?: (command: string) => boolean;
}
export interface ScaffoldAgentHooksResult {
    claude: MergeResult;
    codex: MergeResult;
    claudeUser: MergeResult;
    manifest: HooksManifest;
}
export type ManagedHookVendor = 'claude' | 'codex';
type ManagedHookMutationResult = Partial<Record<ManagedHookVendor, MergeResult>>;
export declare function restoreManagedHooksFromManifest(input: ScaffoldAgentHooksInput, manifest: HooksManifest, vendors?: readonly ManagedHookVendor[]): ManagedHookMutationResult;
export declare function disableManagedHooksFromManifest(input: ScaffoldAgentHooksInput, manifest: HooksManifest, vendors: readonly ManagedHookVendor[]): ManagedHookMutationResult;
export type ResolvePackageRootForHookLaunchersOptions = ResolveAgentKitPackageRootOptions;
export declare function resolvePackageRootForHookLaunchers(options?: ResolvePackageRootForHookLaunchersOptions): string;
/**
 * The `wp hook <sub>` subcommand a managed launcher should dispatch to. The
 * names map 1:1 by stripping the `wp-` prefix; `isHookName` is the single
 * source of truth.
 */
export declare function hookSubcommandFor(binName: string): string | undefined;
export declare function scaffoldAgentHooks(input: ScaffoldAgentHooksInput): Promise<ScaffoldAgentHooksResult>;
//# sourceMappingURL=index.d.ts.map