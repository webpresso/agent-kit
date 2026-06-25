import { afterEach, describe, expect, it, vi } from "vitest";

import {
  _setSyncAdapterFactory,
  resolveSyncAdapter,
  runPlatformMutationSync,
  type SyncAdapter,
} from "#mcp/blueprint/_shared/sync";

const createdEvent: Parameters<SyncAdapter["pushEvent"]>[0] = {
  eventId: "evt-1",
  repoId: "repo-1",
  occurredAt: "2026-06-14T00:00:00.000Z",
  type: "blueprint.created",
  payload: {
    type: "blueprint.created",
    slug: "sync-test",
    title: "Sync Test",
    complexity: "S",
    status: "draft",
  },
};

describe("blueprint sync shared seam", () => {
  afterEach(() => {
    _setSyncAdapterFactory(null);
    vi.unstubAllEnvs();
  });

  it("resolves to null when platform sync is disabled before consulting the factory", async () => {
    const factory = vi.fn<() => SyncAdapter | null>(() => {
      throw new Error("factory should not be called");
    });
    _setSyncAdapterFactory(factory);
    vi.stubEnv("WP_BLUEPRINT_PLATFORM_DISABLED", "1");

    await expect(resolveSyncAdapter("/tmp/repo")).resolves.toBeNull();
    expect(factory).not.toHaveBeenCalled();
  });

  it("uses the injected adapter factory seam", async () => {
    const adapter: SyncAdapter = {
      pushEvent: vi.fn<SyncAdapter["pushEvent"]>().mockResolvedValue(undefined),
      ensureFresh: vi.fn<SyncAdapter["ensureFresh"]>().mockResolvedValue(undefined),
    };
    _setSyncAdapterFactory(() => adapter);

    await expect(resolveSyncAdapter("/tmp/repo")).resolves.toBe(adapter);
  });

  it("runs platform mutation sync through the resolved adapter", async () => {
    const pushEvent = vi.fn<SyncAdapter["pushEvent"]>().mockResolvedValue(undefined);
    const ensureFresh = vi.fn<SyncAdapter["ensureFresh"]>().mockResolvedValue(undefined);
    const adapter: SyncAdapter = { pushEvent, ensureFresh };

    await runPlatformMutationSync(adapter, {
      label: "wp_blueprint_sync_test",
      event: createdEvent,
      ensureFreshSlug: "sync-test",
    });

    expect(pushEvent).toHaveBeenCalledWith(createdEvent);
    expect(ensureFresh).toHaveBeenCalledWith({ slug: "sync-test" });
  });
});
