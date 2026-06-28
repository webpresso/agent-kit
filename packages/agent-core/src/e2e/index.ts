/**
 * Generic e2e primitives: open-port resolution, HTTP health polling, and
 * fail-closed secret-env resolution. Self-contained.
 */
import { createServer } from "node:net";

/**
 * Resolve an open local TCP port. Prefers IPv6 loopback (`::1`) then falls back
 * to `127.0.0.1`. If both fail, the last bind error is surfaced, not swallowed.
 */
export async function getAvailablePort(): Promise<number> {
  let lastError: unknown;
  for (const host of ["::1", "127.0.0.1"] as const) {
    try {
      return await new Promise<number>((resolvePort, reject) => {
        const server = createServer();
        server.on("error", reject);
        server.listen(0, host, () => {
          const address = server.address();
          if (!address || typeof address === "string") {
            server.close(() =>
              reject(new Error(`Failed to resolve an open local port for ${host}`)),
            );
            return;
          }
          const { port } = address;
          server.close((error) => (error ? reject(error) : resolvePort(port)));
        });
      });
    } catch (error) {
      lastError = error; // Try the next host family, but preserve the cause.
    }
  }
  const detail = lastError instanceof Error ? lastError.message : String(lastError);
  throw new Error(`Failed to resolve an open local port (last error: ${detail})`);
}

export interface WaitForHttpOkOptions {
  readonly timeoutMs?: number;
  readonly intervalMs?: number;
  /** Liveness probe; when it returns false the wait fails fast (process died). */
  readonly isAlive?: () => boolean;
  /** Injectable fetch for tests. Defaults to the global `fetch`. */
  readonly fetchImpl?: typeof fetch;
}

/** Poll `url` until it responds 2xx, or throw after `timeoutMs`. */
export async function waitForHttpOk(
  url: string,
  options: WaitForHttpOkOptions = {},
): Promise<void> {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const intervalMs = options.intervalMs ?? 1_000;
  const fetchImpl = options.fetchImpl ?? fetch;
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (options.isAlive && !options.isAlive()) {
      throw new Error(`Process for ${url} exited before becoming healthy`);
    }
    try {
      const res = await fetchImpl(url);
      if (res.ok) return;
    } catch {
      // Not up yet; keep polling until the deadline.
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, intervalMs));
  }
  throw new Error(`${url} did not become healthy within ${timeoutMs}ms`);
}

type ResolveRuntimeProfile = (
  profile: string,
  options?: { fresh?: boolean },
) => Promise<Record<string, string>>;

export interface ResolveE2eSecretEnvOptions {
  readonly env: NodeJS.ProcessEnv;
  readonly profile: string;
  /** Env keys the e2e run requires. */
  readonly requiredKeys: readonly string[];
  /** Consumer's profile resolver (injected; agent-core does not pick a provider). */
  readonly resolveRuntimeProfile: ResolveRuntimeProfile;
  /** Keys whose presence means a secret-provider token is configured (force resolution). */
  readonly providerTokenKeys?: readonly string[];
}

function allPresent(env: NodeJS.ProcessEnv, keys: readonly string[]): boolean {
  return keys.length > 0 && keys.every((k) => typeof env[k] === "string" && env[k]!.length > 0);
}

function anyPresent(env: NodeJS.ProcessEnv, keys: readonly string[]): boolean {
  return keys.some((k) => typeof env[k] === "string" && env[k]!.length > 0);
}

/**
 * Resolve the secret env for an e2e run, failing closed when required keys are
 * missing. The consumer declares which keys it needs and which signal a provider
 * token; agent-core enforces resolution and knows no app-specific secret names.
 * Never logs secret values; resolver errors propagate (no silent degrade).
 */
export async function resolveE2eSecretEnv(
  options: ResolveE2eSecretEnvOptions,
): Promise<NodeJS.ProcessEnv> {
  const { env, profile, requiredKeys, resolveRuntimeProfile } = options;
  const providerTokenKeys = options.providerTokenKeys ?? [];

  const injectedConfig = allPresent(env, requiredKeys);
  const providerTokenPresent = anyPresent(env, providerTokenKeys);
  if (injectedConfig && !providerTokenPresent) return { ...env };

  const resolved = await resolveRuntimeProfile(profile, { fresh: true });
  const merged = { ...env, ...resolved };
  if (!allPresent(merged, requiredKeys)) {
    throw new Error(
      `Secret provider did not return required e2e secrets: ${requiredKeys.join(", ")}.`,
    );
  }
  return merged;
}
