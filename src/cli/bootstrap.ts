/**
 * Pre-flight hook for the `ak` CLI.
 *
 * The upstream `wp` CLI wires secret-manager bootstrap into this step. The
 * generalized agent-kit CLI has no secrets dependency, so this module is an
 * intentionally minimal pass-through. It exists so subcommand modules can
 * import from a stable location — future pre-flight (e.g., config-file
 * detection, telemetry opt-in) lands here without churn elsewhere.
 */

export async function bootstrapAk(_argv: string[] = process.argv): Promise<void> {
  // no-op today
}
