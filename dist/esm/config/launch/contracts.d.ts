/**
 * Contract-safe launch-engine primitives.
 *
 * These types are intentionally host-agnostic: they describe the generic
 * shape of a provisioned database handle and a launch profile without
 * referencing any concrete host provisioner or Webpresso-specific app
 * slug. Host adapters are responsible for mapping their internal types
 * into these contracts before calling launch-engine.
 *
 * @module @webpresso/agent-launch/contracts
 */
/**
 * Generic handle for a provisioned database used during a launch.
 *
 * Hosts typically back this with a dedicated branch/snapshot from their
 * database provider. Launch-engine never inspects provider-specific fields;
 * it only reads the URIs and forwards the handle to caller-supplied
 * selectors when building environment vars.
 */
export interface ProvisionedDatabaseHandle {
    /** Opaque identifier for the provisioned database. */
    id: string;
    /**
     * Canonical connection string. Used as the default runtime URL when the
     * caller does not supply a {@link DatabaseUrlSelector}.
     */
    primaryConnectionUri: string;
    /**
     * Optional application-tier URL (e.g. pooled/session-mode endpoint) for
     * workloads that hold long-lived connections or depend on prepared
     * statements.
     */
    applicationConnectionUri?: string;
    /**
     * Optional runtime-tier URL (e.g. direct/short-lived endpoint) for
     * standard request-scoped worker runtimes.
     */
    runtimeConnectionUri?: string;
}
/**
 * Caller-supplied selector that chooses which connection URIs a launch
 * should export as `DATABASE_URL` (and optionally
 * `HASURA_GRAPHQL_METADATA_DATABASE_URL`).
 */
export type DatabaseUrlSelector = (handle: ProvisionedDatabaseHandle) => {
    runtimeDatabaseUrl: string;
    metadataDatabaseUrl?: string;
};
/**
 * Generic launch profile: everything needed to build a single launch
 * registration, expressed without reference to any host-specific runtime
 * implementation (e.g. cloudflare wrangler, vite, graphql runtimes).
 */
export interface LaunchProfile {
    /** Working directory of the runtime being launched. */
    cwd: string;
    /** Plain, non-secret env vars the runtime requires. */
    vars: Record<string, string>;
    /** Optional log-file path the caller will use for the spawned process. */
    logFile?: string;
    /** Optional provisioned database handle to expose via env vars. */
    databaseHandle?: ProvisionedDatabaseHandle;
    /**
     * Optional selector that maps a {@link ProvisionedDatabaseHandle} to the
     * runtime/metadata URLs exported to the launch environment. Defaults to
     * the handle's {@link ProvisionedDatabaseHandle.primaryConnectionUri}.
     */
    databaseUrlSelector?: DatabaseUrlSelector;
}
/**
 * Result of a successful launch-engine registration.
 *
 * This is the generic, spawnable descriptor: callers decide when (and
 * whether) to actually spawn a process from it. Host adapters may extend
 * this shape with their own metadata when needed.
 */
export interface LaunchRegistration {
    /** Spawn command (e.g. node, pnpm). */
    command: string;
    /** Arguments to pass to the command. */
    args: readonly string[];
    /** Working directory for the spawn. */
    cwd: string;
    /** Effective environment for the spawn. */
    env: NodeJS.ProcessEnv;
    /** Ports allocated for this launch. */
    ports: {
        api: number;
        inspector: number;
    };
    /** Optional log-file path threaded through from the profile. */
    logFile?: string;
    /**
     * The provisioned database handle (if any) used to assemble this
     * registration, forwarded so callers can later tear down the resource
     * without re-plumbing state.
     */
    databaseHandle?: ProvisionedDatabaseHandle;
}
//# sourceMappingURL=contracts.d.ts.map