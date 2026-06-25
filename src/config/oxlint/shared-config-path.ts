import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Runtime-provided absolute anchor: this module's own directory. The generated
// oxlintrc.json ships alongside it in dist/esm/config/oxlint/. Anchoring on the
// module path (not the consumer cwd) is also where the relative jsPlugins
// resolve from. Derived without './'/'..' traversal per the absolute-path
// policy.
const MODULE_DIR = dirname(fileURLToPath(import.meta.url));

/**
 * Local oxlint config filenames that, when present in a consumer repo, mean the
 * consumer is overriding the shared config — `wp lint` then defers to oxlint's
 * own discovery instead of injecting `--config`.
 */
const LOCAL_OXLINT_CONFIG_FILES = [
  "oxlint.config.ts",
  "oxlint.config.js",
  ".oxlintrc.json",
  ".oxlintrc",
] as const;

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
export function resolveSharedOxlintConfigPath(): string | null {
  const path = join(MODULE_DIR, "oxlintrc.json");
  return existsSync(path) ? path : null;
}

/** True when the consumer ships its own oxlint config (override → no injection). */
export function hasLocalOxlintConfig(cwd: string): boolean {
  return LOCAL_OXLINT_CONFIG_FILES.some((name) => existsSync(join(cwd, name)));
}

/**
 * The `--config <shared>` argument pair to inject into a `vp lint`/oxlint
 * invocation, or `[]` when the shared config should not be used: the consumer
 * already passed `--config`, ships a local oxlint config, or agent-kit's
 * generated config is missing.
 */
export function sharedOxlintConfigArgs(cwd: string, existingArgs: readonly string[]): string[] {
  if (existingArgs.includes("--config") || existingArgs.includes("-c")) return [];
  if (hasLocalOxlintConfig(cwd)) return [];
  const shared = resolveSharedOxlintConfigPath();
  return shared ? ["--config", shared] : [];
}
