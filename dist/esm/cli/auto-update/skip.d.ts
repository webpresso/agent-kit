/**
 * Decide whether to skip the auto-update check entirely for this invocation.
 *
 * Returning `true` means: bypass the *whole* update flow — no registry probe,
 * no banner, no spawn. This is for invocations where running the flow would be
 * either useless or actively harmful:
 *
 *   - `--version` / `-v` / `--help` / `-h` — informational verbs that should
 *     never trigger background work.
 *   - `mcp` subcommand — JSON-RPC stdio mode; stderr writes would corrupt the
 *     transport.
 *   - `WP_SKIP_UPDATE_CHECK=1` — explicit user opt-out of the whole flow.
 *   - `CI=true` (and the broader set of CI signals via ci-info-style env
 *     probing) — non-interactive environments don't want surprise spawns.
 *
 * `setup` / `init` intentionally DO NOT skip the update check: setup is the
 * command users run when they want their agent surfaces refreshed, so it should
 * also detect and schedule an agent-kit package refresh when a newer version is
 * available.
 *
 * `WP_SKIP_AUTO_INSTALL=1` does **not** appear here — that variable only
 * disables the install step. The notify side of the flow still runs so users
 * get a banner. That check belongs in the installer module.
 */
export declare const INFORMATIONAL_FLAGS: Set<string>;
export declare const CI_ENV_KEYS: readonly ["CI", "CONTINUOUS_INTEGRATION", "BUILD_NUMBER", "RUN_ID", "GITHUB_ACTIONS", "GITLAB_CI", "CIRCLECI", "TRAVIS", "APPVEYOR", "BUILDKITE", "DRONE", "JENKINS_URL"];
export declare function shouldSkipUpdateCheck(env: NodeJS.ProcessEnv, argv: string[]): boolean;
/**
 * Whether the installer step should be suppressed (still allow the notify-only
 * banner). Separate from `shouldSkipUpdateCheck` so users can keep notifications
 * but block automatic install.
 */
export declare function shouldSkipAutoInstall(env: NodeJS.ProcessEnv): boolean;
//# sourceMappingURL=skip.d.ts.map