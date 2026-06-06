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
    hosts?: HostCheckMode;
    hostNames?: Array<'codex' | 'opencode' | 'claude'>;
    /** Override the working directory used to detect RTK marker files. Defaults to process.cwd(). */
    cwd?: string;
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
export declare function checkNativePluginRuntime(): DoctorCheck;
/**
 * Verify the consumer's `.claude/settings.json` carries the managed agent-kit
 * hook launchers. Since the hooks are single-sourced there (not in the plugin
 * manifest), a missing reference means a plugin-only install that never ran
 * `wp setup` — i.e. no agent-kit hooks are active.
 */
export declare function checkManagedHooksInstalled(cwd?: string): {
    ok: boolean;
    detail?: string;
};
export declare function runHooksDoctor(opts?: RunHooksDoctorOptions): Promise<DoctorResult>;
export declare function printHooksDoctor(opts?: RunHooksDoctorOptions): Promise<number>;
export {};
//# sourceMappingURL=doctor.d.ts.map