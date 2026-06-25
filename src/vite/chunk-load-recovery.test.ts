import { describe, expect, it, vi } from "vitest";

import { installChunkLoadRecovery, type ChunkLoadRecoveryEvent } from "./chunk-load-recovery.js";

class FakeTarget {
  listeners: Array<(event: ChunkLoadRecoveryEvent) => void> = [];

  addEventListener(_type: "vite:preloadError", listener: (event: ChunkLoadRecoveryEvent) => void) {
    this.listeners.push(listener);
  }

  dispatch(event: ChunkLoadRecoveryEvent) {
    for (const listener of this.listeners) listener(event);
  }
}

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem: vi.fn<(key: string) => string | null>((key: string) => values.get(key) ?? null),
    setItem: vi.fn<(key: string, value: string) => void>((key: string, value: string) => {
      values.set(key, value);
    }),
  };
}

describe("installChunkLoadRecovery", () => {
  it("registers once for a target", () => {
    const target = new FakeTarget();

    expect(installChunkLoadRecovery({ target })).toBe(true);
    expect(installChunkLoadRecovery({ target })).toBe(false);
    expect(target.listeners).toHaveLength(1);
  });

  it("prevents the Vite preload error and reloads once per storage key", () => {
    const target = new FakeTarget();
    const storage = createStorage();
    const reload = vi.fn<() => void>();
    const preventDefault = vi.fn<() => void>();

    installChunkLoadRecovery({ key: "test-key", reload, storage, target });
    target.dispatch({ preventDefault });
    target.dispatch({ preventDefault });

    expect(preventDefault).toHaveBeenCalledTimes(2);
    expect(storage.setItem).toHaveBeenCalledWith("test-key", "1");
    expect(reload).toHaveBeenCalledTimes(1);
  });

  it("does nothing when no browser-like target exists", () => {
    expect(installChunkLoadRecovery()).toBe(false);
  });
});
