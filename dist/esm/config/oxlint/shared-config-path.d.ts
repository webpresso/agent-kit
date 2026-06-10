/**
 * Absolute path to the shipped, resolved oxlint config (`oxlintrc.json`),
 * generated next to this module in `dist/esm/config/oxlint/` by
 * `src/build/generate-oxlintrc.ts`. Anchored on MODULE_DIR (agent-kit's own
 * install location, not the consumer cwd), which is also where the relative
 * `jsPlugins` resolve from.
 *
 * Returns `null` when the generated file is absent (e.g. an unbuilt source
 * tree) so callers degrade to oxlint's own discovery rather than passing a
 * non-existent `--config` path — a loud-safe default, never a silent shim.
 */
export declare function resolveSharedOxlintConfigPath(): string | null;
/** True when the consumer ships its own oxlint config (override → no injection). */
export declare function hasLocalOxlintConfig(cwd: string): boolean;
/**
 * The `--config <shared>` argument pair to inject into a `vp lint`/oxlint
 * invocation, or `[]` when the shared config should not be used: the consumer
 * already passed `--config`, ships a local oxlint config, or agent-kit's
 * generated config is missing.
 */
export declare function sharedOxlintConfigArgs(cwd: string, existingArgs: readonly string[]): string[];
//# sourceMappingURL=shared-config-path.d.ts.map