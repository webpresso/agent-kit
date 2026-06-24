/**
 * `wp hooks doctor` — post-install plugin health verification.
 *
 * Verifies the agent-kit plugin installation is healthy:
 * - all hook bins exist
 * - bins are executable (skip on win32)
 * - bins respond to empty stdin with exit 0 + JSON
 * - plugin.json exists and references only paths that exist
 * - MCP server starts and responds to tools/list (soft-fail)
 * - installed host CLIs (Codex/OpenCode/Claude) can see the expected surfaces
 */
export interface DoctorCheck {
    name: string;
    ok: boolean;
    detail?: string;
    /** Advisory checks surface a warning but do not flip the doctor's exit code. */
    advisory?: boolean;
}
export interface DoctorResult {
    ok: boolean;
    checks: DoctorCheck[];
}
type HostCheckMode = 'auto' | 'skip' | 'required';
export interface RunHooksDoctorOptions {
    skipMcp?: boolean;
    fix?: boolean;
    hosts?: HostCheckMode;
    hostNames?: Array<'codex' | 'opencode' | 'claude'>;
    /** Override the working directory used to detect RTK marker files. Defaults to process.cwd(). */
    cwd?: string;
    /** Test seam for the safe restore path used by `wp hooks doctor --fix`. */
    runRestoreFix?: (cwd: string) => Promise<number>;
    /**
     * Fire the smallest allow/deny conformance rows (PROBE_ROWS) against the real
     * pretool-guard and assert the routing decision. Off by default — the default
     * doctor stays cheap (empty-stdin liveness only). This is operator-side
     * semantic confirmation; CI already enforces decisions via the conformance
     * matrix boundary suite.
     */
    probeDecisions?: boolean;
}
export type HookFixStatus = 'fixed' | 'prepared' | 'requires-approval' | 'blocked';
export interface HookFixResult {
    readonly status: HookFixStatus;
    readonly detail: string;
    readonly preservedFiles?: readonly string[];
    readonly nextCommand?: string;
}
export interface ResolvePackageRootForRuntimeOptions {
    readonly moduleUrl?: string;
    readonly execPath?: string;
    readonly argv0?: string;
    readonly argv1?: string;
    readonly pathEnv?: string;
    readonly pathExtEnv?: string;
    readonly platform?: NodeJS.Platform;
}
export declare function resolvePackageRootForRuntime(options?: ResolvePackageRootForRuntimeOptions): string | null;
export declare function findOwningPackageRoot(startDir: string): string | null;
export declare function checkRtkOnPath(cwd?: string): Promise<DoctorCheck | null>;
export declare function checkRootLauncherContract(): DoctorCheck;
export declare function checkOmxPluginCacheStaleSurfaceRepair(options?: {
    codexHome?: string;
    nodeBinary?: string;
    repair?: (codexHome: string, nodeBinary: string) => string[];
}): DoctorCheck;
export declare function checkNativePluginRuntime(): DoctorCheck;
export declare function checkPhase2RuntimeTypecheckParity(): DoctorCheck;
export declare function checkPackagedHostArtifacts(cwd?: string): DoctorCheck;
export declare function checkHostArtifactOwnership(cwd?: string): DoctorCheck;
export declare function checkHostLifecycleDepth(): DoctorCheck;
/**
 * Verify the consumer's `.claude/settings.json` carries the direct agent-kit
 * hook commands. Since the hooks are single-sourced there (not in the plugin
 * manifest), a missing reference means a plugin-only install that never ran
 * `wp setup` — i.e. no agent-kit hooks are active.
 */
export declare function checkManagedHooksInstalled(cwd?: string): {
    ok: boolean;
    detail?: string;
};
/**
 * Compare the installed hooks against the `.webpresso/hooks-manifest.json`.
 * Reports advisory findings per hook entry (ok / missing / unknown).
 * When the manifest is absent, emits a single info-level advisory prompting
 * the user to run `wp setup`.
 */
export declare function checkHooksManifest(cwd?: string): DoctorCheck;
export declare function buildHooksDoctorFixPlan(cwd?: string): HookFixResult;
/**
 * Detect competing hook plugins (e.g. oh-my-claudecode / OMC) in the Claude
 * plugin registry and report the expected coexistence model.
 *
 * wp hooks live in `.claude/settings.json` (user-owned). Third-party plugin
 * hooks live inside each plugin's own cache directory. `omc update` replaces
 * the plugin cache but never touches `settings.json`, so wp hooks survive
 * by design. When both run, Claude Code fires all matching PreToolUse hooks
 * concurrently; a deny from either wins.
 */
export declare function checkThirdPartyHookCoexistence(options?: {
    claudeConfigDir?: string;
}): DoctorCheck;
export declare function runHooksDoctor(opts?: RunHooksDoctorOptions): Promise<DoctorResult>;
export declare function printHooksDoctor(opts?: RunHooksDoctorOptions): Promise<number>;
export {};
//# sourceMappingURL=doctor.d.ts.map