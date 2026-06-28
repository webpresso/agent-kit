import { describe, expect, it, vi } from "vitest";

import { getAvailablePort, resolveE2eSecretEnv, waitForHttpOk } from "./index";

const okResponse = { ok: true } as Response;
const notOkResponse = { ok: false } as Response;
const REQUIRED = ["DB_KEY", "DB_PROJECT"] as const;
const TOKENS = ["PROVIDER_TOKEN"] as const;

describe("getAvailablePort", () => {
  it("resolves a usable TCP port", async () => {
    const port = await getAvailablePort();
    expect(port).toBeGreaterThan(0);
    expect(port).toBeLessThan(65_536);
  });
});

describe("waitForHttpOk", () => {
  it("resolves once the endpoint returns ok", async () => {
    let calls = 0;
    const fetchImpl = (async () =>
      ++calls >= 2 ? okResponse : notOkResponse) as unknown as typeof fetch;
    await expect(
      waitForHttpOk("http://x/health", { fetchImpl, intervalMs: 1, timeoutMs: 1_000 }),
    ).resolves.toBeUndefined();
  });

  it("throws on timeout, and fails fast when isAlive reports death", async () => {
    const fetchImpl = (async () => notOkResponse) as unknown as typeof fetch;
    await expect(
      waitForHttpOk("http://x/health", { fetchImpl, intervalMs: 1, timeoutMs: 20 }),
    ).rejects.toThrow(/did not become healthy/u);
    await expect(
      waitForHttpOk("http://x/health", { fetchImpl, isAlive: () => false, timeoutMs: 10_000 }),
    ).rejects.toThrow(/exited before becoming healthy/u);
  });
});

describe("resolveE2eSecretEnv", () => {
  it("uses injected env without resolving when no provider token is present", async () => {
    const resolver = vi.fn();
    const out = await resolveE2eSecretEnv({
      env: { DB_KEY: "a", DB_PROJECT: "b" },
      profile: "secrets-only",
      requiredKeys: REQUIRED,
      providerTokenKeys: TOKENS,
      resolveRuntimeProfile: resolver as never,
    });
    expect(resolver).not.toHaveBeenCalled();
    expect(out.DB_KEY).toBe("a");
  });

  it("resolves and merges when required keys are absent", async () => {
    const resolver = vi.fn(async () => ({ DB_KEY: "x", DB_PROJECT: "y" }));
    const out = await resolveE2eSecretEnv({
      env: {},
      profile: "secrets-only",
      requiredKeys: REQUIRED,
      resolveRuntimeProfile: resolver,
    });
    expect(out.DB_PROJECT).toBe("y");
  });

  it("fails closed when a provider token is present but resolution omits required keys", async () => {
    const resolver = vi.fn(async () => ({ DB_KEY: "x" }));
    await expect(
      resolveE2eSecretEnv({
        env: { PROVIDER_TOKEN: "t" },
        profile: "secrets-only",
        requiredKeys: REQUIRED,
        providerTokenKeys: TOKENS,
        resolveRuntimeProfile: resolver,
      }),
    ).rejects.toThrow(/did not return required e2e secrets/u);
  });

  it("propagates resolver errors (no silent degrade)", async () => {
    const resolver = vi.fn(async () => {
      throw new Error("provider down");
    });
    await expect(
      resolveE2eSecretEnv({
        env: {},
        profile: "secrets-only",
        requiredKeys: REQUIRED,
        resolveRuntimeProfile: resolver,
      }),
    ).rejects.toThrow(/provider down/u);
  });
});
