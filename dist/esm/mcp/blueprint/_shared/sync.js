import path from 'node:path';
/**
 * Module-level factory.  `null` = use the production default (loadSyncCredentials
 * from auth.ts + BlueprintSyncClient + ReplicaManager — lazy-imported so that
 * blueprint-server.ts never statically depends on the HTTP client).
 */
let _syncAdapterFactory = null;
/**
 * Override the adapter factory — for tests only.
 * Pass `null` to restore the production default.
 *
 * @internal
 */
export function _setSyncAdapterFactory(factory) {
    _syncAdapterFactory = factory;
}
/**
 * Resolve the sync adapter for the current request.
 *
 * Iron rule: returns `null` when `WP_BLUEPRINT_PLATFORM_DISABLED=1` regardless
 * of any injected factory — the caller must skip all platform operations.
 *
 * @param cwd - repo working directory, used to locate the replica DB file.
 */
export async function resolveSyncAdapter(cwd) {
    if (process.env['WP_BLUEPRINT_PLATFORM_DISABLED'] === '1')
        return null;
    if (_syncAdapterFactory !== null) {
        return _syncAdapterFactory();
    }
    // Production default: lazy-import to avoid coupling the module to the HTTP client.
    // #sync/* resolves via the fallback "#*" → "./src/blueprint/*.ts" mapping.
    const [{ BlueprintSyncClient }, { loadSyncCredentials }, { ReplicaManager }, { openDb: openDbForReplica },] = await Promise.all([
        import('#sync/client.js'),
        import('#sync/auth.js'),
        import('#sync/replica.js'),
        import('#db/connection.js'),
    ]);
    const creds = loadSyncCredentials();
    if (creds === null)
        return null;
    const client = new BlueprintSyncClient(creds);
    // ReplicaManager needs a db handle; store the replica DB in the state root.
    const { getSurfacePath, NotInGitRepoError } = await import('#paths/state-root.js');
    const replicaDbPath = (() => {
        try {
            return getSurfacePath('blueprints/replica.db', 'repo', cwd);
        }
        catch (err) {
            if (err instanceof NotInGitRepoError)
                return path.join(cwd, '.agent', '.replica.db');
            throw err;
        }
    })();
    const conn = openDbForReplica(replicaDbPath);
    const manager = new ReplicaManager({ client, db: conn.db });
    return {
        pushEvent: (event) => client.pushEvent(event),
        ensureFresh: (opts) => manager.ensureFresh(opts),
    };
}
const DEFAULT_PLATFORM_MUTATION_TIMEOUT_MS = 5_000;
const toStr = (e) => (e instanceof Error ? e.message : String(e));
function readPlatformMutationTimeoutMs() {
    const parsed = Number.parseInt(process.env['WP_BLUEPRINT_PLATFORM_MUTATION_TIMEOUT_MS'] ??
        String(DEFAULT_PLATFORM_MUTATION_TIMEOUT_MS), 10);
    return Math.max(1, Number.isFinite(parsed) ? parsed : DEFAULT_PLATFORM_MUTATION_TIMEOUT_MS);
}
async function awaitPlatformMutationStep(promise, label, timeoutMs) {
    await Promise.race([
        promise,
        new Promise((_, reject) => {
            setTimeout(() => reject(new Error(`${label} timed out after ${timeoutMs}ms`)), timeoutMs);
        }),
    ]);
}
export async function runPlatformMutationSync(adapter, options) {
    if (adapter === null)
        return;
    const timeoutMs = readPlatformMutationTimeoutMs();
    try {
        if (options.event) {
            await awaitPlatformMutationStep(adapter.pushEvent(options.event), `${options.label} pushEvent`, timeoutMs);
        }
        if (options.ensureFreshSlug) {
            await awaitPlatformMutationStep(adapter.ensureFresh({ slug: options.ensureFreshSlug }), `${options.label} ensureFresh`, timeoutMs);
        }
    }
    catch (error) {
        throw new Error(`${options.label} platform sync failed: ${error instanceof Error ? error.message : toStr(error)}`);
    }
}
//# sourceMappingURL=sync.js.map